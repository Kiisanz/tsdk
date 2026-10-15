import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

import { fileURLToPath } from 'node:url';

const CLI_BIN = fileURLToPath(new URL('../index.js', import.meta.url));

describe('tsnx ref multi-target and smart error diagnostics', () => {
  it('supports multi-target ref add, fuzzy suggestions, npm package guidance, and multi-target ref remove', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-ref-test-'));

    try {
      // 1. Initialize a native workspace: Acme
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'Acme', '--scope', '@acme', '--no-install'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      // 2. Create 3 projects: Host (webapi), Domain (library), Contracts (library)
      execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'webapi', 'Host', '--no-install'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );
      execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'library', 'Domain', '--no-install'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );
      execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'library', 'Contracts', '--no-install'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      const hostDir = path.join(tmpDir, 'Host');

      // 3. Test Smart Diagnostics: Typo suggestion
      let typoOutput = '';
      try {
        execFileSync(
          process.execPath,
          [CLI_BIN, 'ref', 'add', 'Domian', '--no-install'],
          { cwd: hostDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        );
        assert.fail('Should fail on non-existent project');
      } catch (err: any) {
        typoOutput = (err.stdout || '') + (err.stderr || '');
      }
      assert.ok(
        typoOutput.includes('Did you mean:') && typoOutput.includes('Domain'),
        `Expected typo suggestion for Domain, got: ${typoOutput}`,
      );

      // 4. Test Smart Diagnostics: External npm package guidance
      let npmOutput = '';
      try {
        execFileSync(
          process.execPath,
          [CLI_BIN, 'ref', 'add', 'zod', '--no-install'],
          { cwd: hostDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        );
        assert.fail('Should fail on external npm package');
      } catch (err: any) {
        npmOutput = (err.stdout || '') + (err.stderr || '');
      }
      assert.ok(
        npmOutput.includes('For external npm packages, use your package manager (e.g., pnpm add zod)'),
        `Expected npm guidance, got: ${npmOutput}`,
      );

      // 5. Test Multi-Target ref add: Add both Domain and Contracts in a single command
      const multiAddOutput = execFileSync(
        process.execPath,
        [CLI_BIN, 'ref', 'add', 'Domain', 'Contracts', '--no-install'],
        { cwd: hostDir, encoding: 'utf-8' },
      );
      assert.ok(multiAddOutput.includes('Added reference to "Domain"'));
      assert.ok(multiAddOutput.includes('Added reference to "Contracts"'));

      // Verify tsconfig.json references has both
      const hostTsconfig = JSON.parse(fs.readFileSync(path.join(hostDir, 'tsconfig.json'), 'utf-8'));
      const refPaths = hostTsconfig.references.map((r: any) => r.path);
      assert.ok(refPaths.includes('../Domain'), 'Missing ../Domain reference in tsconfig');
      assert.ok(refPaths.includes('../Contracts'), 'Missing ../Contracts reference in tsconfig');

      // Verify package.json dependencies has both
      const hostPkg = JSON.parse(fs.readFileSync(path.join(hostDir, 'package.json'), 'utf-8'));
      assert.equal(hostPkg.dependencies['@acme/domain'], 'workspace:*');
      assert.equal(hostPkg.dependencies['@acme/contracts'], 'workspace:*');

      // 6. Test Multi-Target ref remove: Remove both Domain and Contracts in a single command
      const multiRemoveOutput = execFileSync(
        process.execPath,
        [CLI_BIN, 'ref', 'remove', 'Domain', 'Contracts', '--no-install'],
        { cwd: hostDir, encoding: 'utf-8' },
      );
      assert.ok(multiRemoveOutput.includes('Removed reference to "Domain"'));
      assert.ok(multiRemoveOutput.includes('Removed reference to "Contracts"'));

      const derefTsconfig = JSON.parse(fs.readFileSync(path.join(hostDir, 'tsconfig.json'), 'utf-8'));
      assert.deepEqual(derefTsconfig.references, []);

      const derefPkg = JSON.parse(fs.readFileSync(path.join(hostDir, 'package.json'), 'utf-8'));
      assert.equal(derefPkg.dependencies['@acme/domain'], undefined);
      assert.equal(derefPkg.dependencies['@acme/contracts'], undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
