import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CommandLineConfigurationProvider,
  Configuration,
  EnvironmentVariablesConfigurationProvider,
  JsonConfigurationProvider,
  MemoryConfigurationProvider,
} from '../config/index.js';

describe('@tsnx/hosting: Configuration Pipeline', () => {
  it('respects provider priority: defaults < json < env < cli', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-cfg-'));

    try {
      // 1. JSON file
      const jsonFile = path.join(tmpDir, 'appsettings.json');
      fs.writeFileSync(
        jsonFile,
        JSON.stringify({
          Port: '8080',
          Database: {
            Host: 'db.json.local',
            User: 'json_user',
          },
        }),
      );

      // 2. Custom Environment map
      const envMap: Record<string, string> = {
        APP_DATABASE__HOST: 'db.env.local',
        APP_TIMEOUT: '30s',
      };

      // 3. CLI Args
      const cliArgs = ['--Database:Host=db.cli.local', '--Debug=true'];

      const config = new Configuration([
        // Provider 1: Memory Defaults
        new MemoryConfigurationProvider({
          Port: '3000',
          AppName: 'MyService',
          Database: {
            Host: 'db.default.local',
            User: 'default_user',
          },
        }),
        // Provider 2: JSON file
        new JsonConfigurationProvider(jsonFile),
        // Provider 3: Env vars
        new EnvironmentVariablesConfigurationProvider('APP_', envMap),
        // Provider 4: CLI
        new CommandLineConfigurationProvider(cliArgs),
      ]);

      // Assert priority:
      // AppName comes from Memory (no overrides)
      assert.equal(config.get('AppName'), 'MyService');

      // Database.User: Memory ('default_user') < JSON ('json_user') -> 'json_user'
      assert.equal(config.get('Database:User'), 'json_user');

      // Port: Memory ('3000') < JSON ('8080') -> '8080'
      assert.equal(config.get('Port'), '8080');

      // Timeout: Env overrides
      assert.equal(config.get('Timeout'), '30s');

      // Database.Host: Memory < JSON < Env ('db.env.local') < CLI ('db.cli.local') -> 'db.cli.local'
      assert.equal(config.get('Database:Host'), 'db.cli.local');
      assert.equal(config.get('database.host'), 'db.cli.local'); // case-insensitive path

      // Debug: CLI
      assert.equal(config.get('Debug'), 'true');

      // Default value fallback for missing key
      assert.equal(config.get('NonExistent', 'fallback'), 'fallback');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
