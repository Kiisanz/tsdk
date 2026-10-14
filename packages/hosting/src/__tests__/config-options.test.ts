import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CommandLineConfigurationProvider,
  Configuration,
  EnvironmentVariablesConfigurationProvider,
  HostApplicationBuilder,
  JsonConfigurationProvider,
  MemoryConfigurationProvider,
  OptionsValidationError,
  createToken,
  optionsSnapshotToken,
  optionsToken,
} from '../index.js';

interface DatabaseOptions {
  connectionString: string;
  maxConnections: number;
  ssl: boolean;
}

const DATABASE_OPTIONS = createToken<DatabaseOptions>('DatabaseOptions');

interface ServerOptions {
  port: number;
  host: string;
}

const SERVER_OPTIONS = createToken<ServerOptions>('ServerOptions');

describe('@tsnx/hosting: Configuration & Options Milestone', () => {
  it('enforces configuration precedence: defaults < json < json.{env} < env vars < cli args', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-cfg-prec-'));

    try {
      // 1. Base JSON
      const baseJson = path.join(tmpDir, 'appsettings.json');
      fs.writeFileSync(
        baseJson,
        JSON.stringify({
          App: { Name: 'BaseApp', Version: '1.0.0' },
          Server: { Port: 4000, Host: '0.0.0.0' },
          Database: { MaxConnections: 10, Host: 'base.db' },
        }),
      );

      // 2. Env-specific JSON (staging)
      const stagingJson = path.join(tmpDir, 'appsettings.staging.json');
      fs.writeFileSync(
        stagingJson,
        JSON.stringify({
          App: { Name: 'StagingApp' },
          Server: { Port: 5000 },
          Database: { Host: 'staging.db' },
        }),
      );

      // 3. Environment Variables
      const envSource: Record<string, string> = {
        TSNX_SERVER__PORT: '6000',
        TSNX_DATABASE__HOST: 'env.db',
      };

      // 4. CLI Arguments
      const cliArgs = ['--Server:Port=7000', '--Database:Ssl=true'];

      const config = new Configuration([
        // Defaults
        new MemoryConfigurationProvider({
          App: { Name: 'DefaultApp', Cluster: 'eu-central' },
          Server: { Port: 3000, Host: 'localhost' },
          Database: { MaxConnections: 5, Host: 'default.db', Ssl: false },
        }),
        // Base JSON
        new JsonConfigurationProvider(baseJson),
        // Staging JSON
        new JsonConfigurationProvider(stagingJson),
        // Environment variables
        new EnvironmentVariablesConfigurationProvider('TSNX_', envSource),
        // CLI arguments
        new CommandLineConfigurationProvider(cliArgs),
      ]);

      // Non-overridden key from defaults:
      assert.equal(config.get('App:Cluster'), 'eu-central');

      // Key overridden by Base JSON:
      assert.equal(config.get('App:Version'), '1.0.0');

      // Key overridden by Staging JSON:
      assert.equal(config.get('App:Name'), 'StagingApp');

      // Key overridden by Env: Database.Host was 'base.db' -> 'staging.db' -> 'env.db'
      assert.equal(config.get('Database:Host'), 'env.db');

      // Key overridden by CLI: Server.Port was 3000 -> 4000 -> 5000 -> 6000 -> 7000
      assert.equal(config.getNumber('Server:Port'), 7000);

      // CLI added/overrode boolean:
      assert.equal(config.getBoolean('Database:Ssl'), true);

      // Preserved deep property:
      assert.equal(config.getNumber('Database:MaxConnections'), 10);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles optional missing files gracefully, throws on missing required files, and fails on malformed JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-cfg-files-'));

    try {
      // 1. Missing optional file -> loads empty dict, does not throw
      const missingOptional = path.join(tmpDir, 'non-existent.json');
      const optProvider = new JsonConfigurationProvider(missingOptional, true);
      assert.deepEqual(optProvider.load(), {});

      // 2. Missing required file -> throws error
      const missingRequired = path.join(tmpDir, 'required.json');
      const reqProvider = new JsonConfigurationProvider(missingRequired, false);
      assert.throws(() => reqProvider.load(), /Configuration file .* not found/);

      // 3. Malformed JSON file -> throws parse error even when optional: true
      const malformedFile = path.join(tmpDir, 'malformed.json');
      fs.writeFileSync(malformedFile, '{ "Server": { "Port": 3000, }'); // syntax error (trailing comma)
      const malformedProvider = new JsonConfigurationProvider(malformedFile, true);
      assert.throws(() => malformedProvider.load(), /Failed to parse configuration file/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reads appsettings.{env}.json based on contentRootPath in HostApplicationBuilder', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-host-root-'));

    try {
      fs.writeFileSync(
        path.join(tmpDir, 'appsettings.json'),
        JSON.stringify({
          Server: { Port: 3000, Host: '0.0.0.0' },
        }),
      );

      fs.writeFileSync(
        path.join(tmpDir, 'appsettings.Production.json'),
        JSON.stringify({
          Server: { Port: 9000 },
        }),
      );

      const builder = new HostApplicationBuilder({
        environment: 'Production',
        contentRootPath: tmpDir,
      });

      assert.equal(builder.configuration.getNumber('Server:Port'), 9000);
      assert.equal(builder.configuration.getString('Server:Host'), '0.0.0.0');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports hierarchical section navigation, typed getters, and case-insensitivity', () => {
    const config = new Configuration([
      new MemoryConfigurationProvider({
        Database: {
          ConnectionString: 'postgres://localhost/db',
          Pool: {
            Min: '2',
            Max: 20,
          },
          AutoMigrate: 'true',
        },
      }),
    ]);

    const dbSection = config.getSection('Database');
    assert.equal(dbSection.exists(), true);
    assert.equal(dbSection.getString('ConnectionString'), 'postgres://localhost/db');
    assert.equal(dbSection.getNumber('Pool:Min'), 2);
    assert.equal(dbSection.getNumber('Pool:Max'), 20);
    assert.equal(dbSection.getBoolean('AutoMigrate'), true);

    // Case-insensitive access
    assert.equal(config.get('database:connectionstring'), 'postgres://localhost/db');
    assert.equal(dbSection.get('pool:min', 0), 2);

    // Sub-section chaining
    const poolSection = dbSection.getSection('Pool');
    assert.equal(poolSection.getNumber('Max'), 20);
    assert.equal(poolSection.key, 'Pool');

    // Non-existent section
    const nonExistent = config.getSection('NonExistent');
    assert.equal(nonExistent.exists(), false);
    assert.equal(nonExistent.get('Key', 'fallback'), 'fallback');
  });

  it('binds configuration sections to options objects with validation', () => {
    const builder = new HostApplicationBuilder();

    builder.configuration.addProvider(
      new MemoryConfigurationProvider({
        Database: {
          ConnectionString: 'postgresql://localhost:5432/mytask',
          MaxConnections: '15',
          Ssl: 'true',
        },
      }),
    );

    builder.services
      .configure(DATABASE_OPTIONS)
      .bindConfiguration('Database')
      .validate((opts) => opts.maxConnections > 0, 'MaxConnections must be positive')
      .validate((opts) => opts.connectionString.startsWith('postgresql://'), 'Must use postgresql URI');

    const app = builder.build();
    const options = app.services.get(DATABASE_OPTIONS);

    assert.equal(options.connectionString, 'postgresql://localhost:5432/mytask');
    assert.equal(options.maxConnections, 15);
    assert.equal(options.ssl, true);
  });

  it('throws OptionsValidationError during resolution when validation predicate fails', () => {
    const builder = new HostApplicationBuilder();

    builder.configuration.addProvider(
      new MemoryConfigurationProvider({
        Database: {
          ConnectionString: 'mysql://localhost:3306/db',
          MaxConnections: -5,
        },
      }),
    );

    builder.services
      .configure(DATABASE_OPTIONS)
      .bindConfiguration('Database')
      .validate((opts) => opts.maxConnections > 0, 'MaxConnections must be positive')
      .validate((opts) => opts.connectionString.startsWith('postgresql://'), 'Must use postgresql URI');

    const app = builder.build();

    assert.throws(
      () => app.services.get(DATABASE_OPTIONS),
      (err: any) => {
        assert(err instanceof OptionsValidationError);
        assert.equal(err.failures.length, 2);
        assert(err.message.includes('MaxConnections must be positive'));
        assert(err.message.includes('Must use postgresql URI'));
        return true;
      },
    );
  });

  it('enforces validateOnStart() at host startup (app.start / app.run)', async () => {
    const builder = new HostApplicationBuilder();

    builder.configuration.addProvider(
      new MemoryConfigurationProvider({
        Server: {
          Port: -1, // Invalid port
          Host: 'localhost',
        },
      }),
    );

    builder.services
      .configure(SERVER_OPTIONS)
      .bindConfiguration('Server')
      .validate((opts) => opts.port > 0 && opts.port <= 65535, 'Port must be between 1 and 65535')
      .validateOnStart();

    const app = builder.build();

    // app.start() must throw OptionsValidationError and abort before hosted services run
    await assert.rejects(async () => {
      await app.start();
    }, OptionsValidationError);
  });

  it('differentiates IOptions<T> (singleton) and IOptionsSnapshot<T> (scoped)', () => {
    const builder = new HostApplicationBuilder();

    let counter = 0;
    builder.services
      .configure(DATABASE_OPTIONS)
      .configure((_opts) => {
        counter++;
        return {
          connectionString: `connection-${counter}`,
          maxConnections: counter * 10,
          ssl: false,
        };
      });

    const app = builder.build();

    // 1. Direct injection is singleton
    const direct1 = app.services.get(DATABASE_OPTIONS);
    const direct2 = app.services.get(DATABASE_OPTIONS);
    assert.strictEqual(direct1, direct2);
    assert.equal(direct1.connectionString, 'connection-1');

    // 2. IOptions<T> is singleton
    const optToken = optionsToken<DatabaseOptions>(DATABASE_OPTIONS);
    const ioptions1 = app.services.get(optToken);
    const ioptions2 = app.services.get(optToken);
    assert.strictEqual(ioptions1, ioptions2);
    assert.strictEqual(ioptions1.value, direct1);

    // 3. IOptionsSnapshot<T> is scoped (freshly evaluated per scope, cached within that scope)
    const snapToken = optionsSnapshotToken<DatabaseOptions>(DATABASE_OPTIONS);

    const scope1 = app.services.createScope();
    const snap1a = scope1.serviceProvider.get(snapToken);
    const snap1b = scope1.serviceProvider.get(snapToken);
    // Cached within scope1:
    assert.strictEqual(snap1a, snap1b);
    assert.equal(snap1a.value.connectionString, 'connection-2');

    const scope2 = app.services.createScope();
    const snap2 = scope2.serviceProvider.get(snapToken);
    // Freshly created for scope2:
    assert.notStrictEqual(snap1a, snap2);
    assert.equal(snap2.value.connectionString, 'connection-3');

    scope1.dispose();
    scope2.dispose();
  });
});
