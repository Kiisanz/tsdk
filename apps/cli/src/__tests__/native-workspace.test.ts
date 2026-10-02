import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TsWorkspace } from '@tsnx/core';

const CLI_BIN = fileURLToPath(new URL('../index.js', import.meta.url));

describe('Native TypeScript Workspace & Project References System', () => {
  it('scaffolds native solution workspace with derived scope, custom scope, and no-scope', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-native-ws-'));

    try {
      // 1. Default derived scope: tsnx init workspace -n ArasERP
      const arasDir = path.join(tmpDir, 'ArasERP');
      fs.mkdirSync(arasDir, { recursive: true });
      const initOutput1 = execFileSync(
        process.execPath,
        [CLI_BIN, 'init', 'workspace', '-n', 'ArasERP'],
        { cwd: arasDir, encoding: 'utf-8' },
      );
      assert.ok(initOutput1.includes('Initialized workspace "ArasERP"'));

      const arasPkg = JSON.parse(fs.readFileSync(path.join(arasDir, 'package.json'), 'utf-8'));
      assert.equal(arasPkg.name, 'aras-erp');
      assert.equal(arasPkg.private, true);
      assert.deepEqual(arasPkg.tsnx, { name: 'ArasERP', scope: '@araserp' });

      const arasTsconfig = JSON.parse(fs.readFileSync(path.join(arasDir, 'tsconfig.json'), 'utf-8'));
      assert.deepEqual(arasTsconfig.files, []);
      assert.deepEqual(arasTsconfig.references, []);
      assert.ok(fs.existsSync(path.join(arasDir, 'pnpm-workspace.yaml')));
      assert.equal(fs.existsSync(path.join(arasDir, 'ArasERP.tswork')), false);

      // Verify loaded by TsWorkspace.loadSync
      const ws1 = TsWorkspace.loadSync(arasDir);
      assert.equal(ws1.name, 'ArasERP');
      assert.equal(ws1.scope, '@araserp');

      // 2. Explicit scope: tsnx init workspace -n CustomApp --scope @mycorp
      const customDir = path.join(tmpDir, 'CustomApp');
      fs.mkdirSync(customDir, { recursive: true });
      execFileSync(
        process.execPath,
        [CLI_BIN, 'init', 'workspace', '-n', 'CustomApp', '--scope', '@mycorp'],
        { cwd: customDir, encoding: 'utf-8' },
      );
      const customPkg = JSON.parse(fs.readFileSync(path.join(customDir, 'package.json'), 'utf-8'));
      assert.deepEqual(customPkg.tsnx, { name: 'CustomApp', scope: '@mycorp' });

      // 3. No scope: tsnx init workspace -n PlainApp --no-scope
      const plainDir = path.join(tmpDir, 'PlainApp');
      fs.mkdirSync(plainDir, { recursive: true });
      execFileSync(
        process.execPath,
        [CLI_BIN, 'init', 'workspace', '-n', 'PlainApp', '--no-scope'],
        { cwd: plainDir, encoding: 'utf-8' },
      );
      const plainPkg = JSON.parse(fs.readFileSync(path.join(plainDir, 'package.json'), 'utf-8'));
      assert.deepEqual(plainPkg.tsnx, { name: 'PlainApp' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports full native multi-project workflow: create, de-stuttered scope, ref add dual-wiring, and build', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-native-lifecycle-'));

    try {
      // 1. Initialize native workspace ArasERP
      execFileSync(
        process.execPath,
        [CLI_BIN, 'init', 'workspace', '-n', 'ArasERP'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      // 2. Create library ArasERP.Domain inside packages/Domain
      execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'library', '-n', 'ArasERP.Domain', '-o', 'packages/Domain', '--no-install'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      const domainDir = path.join(tmpDir, 'packages', 'Domain');
      const domainPkg = JSON.parse(fs.readFileSync(path.join(domainDir, 'package.json'), 'utf-8'));
      assert.equal(domainPkg.name, '@araserp/domain'); // De-stuttered!
      assert.equal(domainPkg.private, true);
      assert.deepEqual(domainPkg.exports, {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
          default: './dist/index.js',
        },
      });
      assert.deepEqual(domainPkg.tsnx, { name: 'ArasERP.Domain', type: 'library' });
      assert.ok(fs.existsSync(path.join(domainDir, 'tsconfig.json')));
      assert.equal(fs.existsSync(path.join(domainDir, 'ArasERP.Domain.tsproj')), false); // Native!

      // 3. Create console ArasERP.Host inside apps/Host
      execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'console', '-n', 'ArasERP.Host', '-o', 'apps/Host', '--no-install'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      const hostDir = path.join(tmpDir, 'apps', 'Host');
      const hostPkg = JSON.parse(fs.readFileSync(path.join(hostDir, 'package.json'), 'utf-8'));
      assert.equal(hostPkg.name, '@araserp/host'); // De-stuttered!
      assert.deepEqual(hostPkg.tsnx, { name: 'ArasERP.Host', type: 'console' });
      assert.ok(fs.existsSync(path.join(hostDir, 'tsconfig.json')));
      assert.equal(fs.existsSync(path.join(hostDir, 'ArasERP.Host.tsproj')), false); // Native!

      // Verify root tsconfig.json has both references
      const rootTsconfig = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tsconfig.json'), 'utf-8'));
      assert.deepEqual(rootTsconfig.references, [
        { path: './packages/Domain' },
        { path: './apps/Host' },
      ]);

      // 4. In apps/Host, run tsnx ref add ArasERP.Domain
      const refOutput = execFileSync(
        process.execPath,
        [CLI_BIN, 'ref', 'add', 'ArasERP.Domain'],
        { cwd: hostDir, encoding: 'utf-8' },
      );
      assert.ok(refOutput.includes('Added reference to "ArasERP.Domain"'));

      // Verify dual-wiring:
      // A. apps/Host/tsconfig.json references
      const hostTsconfig = JSON.parse(fs.readFileSync(path.join(hostDir, 'tsconfig.json'), 'utf-8'));
      assert.deepEqual(hostTsconfig.references, [
        { path: '../../packages/Domain' },
      ]);

      // B. apps/Host/package.json dependencies
      const updatedHostPkg = JSON.parse(fs.readFileSync(path.join(hostDir, 'package.json'), 'utf-8'));
      assert.equal(updatedHostPkg.dependencies['@araserp/domain'], 'workspace:*');

      // 5. Update apps/Host/src/main.ts to import from @araserp/domain
      fs.writeFileSync(
        path.join(hostDir, 'src', 'main.ts'),
        `import { add } from '@araserp/domain';\nconsole.log('SUM:', add(20, 22));\n`,
        'utf-8',
      );

      // Link node_modules for runtime module resolution
      const hostModulesDir = path.join(hostDir, 'node_modules', '@araserp');
      fs.mkdirSync(hostModulesDir, { recursive: true });
      fs.symlinkSync(domainDir, path.join(hostModulesDir, 'domain'), 'junction');

      // 6. Build entire solution: tsnx build
      const buildOutput = execFileSync(
        process.execPath,
        [CLI_BIN, 'build'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );
      assert.ok(buildOutput.includes('Build succeeded'));
      // Verify compiled artifacts strictly match package exports
      assert.ok(fs.existsSync(path.join(domainDir, 'dist', 'index.js')));
      assert.ok(fs.existsSync(path.join(domainDir, 'dist', 'index.d.ts')));
      assert.ok(fs.existsSync(path.join(hostDir, 'dist', 'main.js')));

      // 7. Run from workspace root using tsnx run -p ArasERP.Host
      const runOutput = execFileSync(
        process.execPath,
        [CLI_BIN, 'run', '-p', 'ArasERP.Host', '--no-build'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );
      assert.ok(runOutput.includes('SUM: 42'), `Expected "SUM: 42" in runOutput, but received:\n${runOutput}`);

      // 8. Symmetrical removal: tsnx ref remove ArasERP.Domain
      const removeOutput = execFileSync(
        process.execPath,
        [CLI_BIN, 'ref', 'remove', 'ArasERP.Domain'],
        { cwd: hostDir, encoding: 'utf-8' },
      );
      assert.ok(removeOutput.includes('Removed reference to "ArasERP.Domain"'));

      // Verify compiler reference in tsconfig.json is removed
      const derefTsconfig = JSON.parse(fs.readFileSync(path.join(hostDir, 'tsconfig.json'), 'utf-8'));
      assert.deepEqual(derefTsconfig.references, []);

      // Verify workspace dependency in package.json is removed
      const derefPkg = JSON.parse(fs.readFileSync(path.join(hostDir, 'package.json'), 'utf-8'));
      assert.equal(derefPkg.dependencies?.['@araserp/domain'], undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
