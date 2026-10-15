import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const CLI_BIN = fileURLToPath(new URL('../index.js', import.meta.url));

describe('Flexible workspace package patterns and depth', () => {
  it('supports default depth 3, explicit --depth, explicit --packages, and dynamic auto-expansion', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-ws-depth-'));

    try {
      // 1. Default depth 3
      const defaultWsDir = path.join(tmpDir, 'DefaultWs');
      fs.mkdirSync(defaultWsDir, { recursive: true });
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'DefaultWs', '--no-install'],
        { cwd: defaultWsDir, encoding: 'utf-8' },
      );

      const defaultPnpm = parseYaml(fs.readFileSync(path.join(defaultWsDir, 'pnpm-workspace.yaml'), 'utf-8'));
      assert.deepEqual(defaultPnpm.packages, ['*', '*/*', '*/*/*']);

      const defaultPkg = JSON.parse(fs.readFileSync(path.join(defaultWsDir, 'package.json'), 'utf-8'));
      assert.deepEqual(defaultPkg.workspaces, ['*', '*/*', '*/*/*']);

      // 2. Explicit --depth 4
      const depth4WsDir = path.join(tmpDir, 'Depth4Ws');
      fs.mkdirSync(depth4WsDir, { recursive: true });
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'Depth4Ws', '--depth', '4', '--no-install'],
        { cwd: depth4WsDir, encoding: 'utf-8' },
      );

      const depth4Pnpm = parseYaml(fs.readFileSync(path.join(depth4WsDir, 'pnpm-workspace.yaml'), 'utf-8'));
      assert.deepEqual(depth4Pnpm.packages, ['*', '*/*', '*/*/*', '*/*/*/*']);

      // 3. Explicit --packages
      const customWsDir = path.join(tmpDir, 'CustomWs');
      fs.mkdirSync(customWsDir, { recursive: true });
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'CustomWs', '--packages', 'apps/*,modules/*', '--no-install'],
        { cwd: customWsDir, encoding: 'utf-8' },
      );

      const customPnpm = parseYaml(fs.readFileSync(path.join(customWsDir, 'pnpm-workspace.yaml'), 'utf-8'));
      assert.deepEqual(customPnpm.packages, ['apps/*', 'modules/*']);

      // 4. Dynamic auto-expansion when creating or adding deeply nested project (depth 4)
      execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'library', 'DeepModule', '-o', 'modules/finance/payroll/DeepModule', '--no-install'],
        { cwd: defaultWsDir, encoding: 'utf-8' },
      );

      // Verify that defaultWs (which started with depth 3) auto-expanded to include depth 4 pattern (*/*/*/*)
      const updatedPnpm = parseYaml(fs.readFileSync(path.join(defaultWsDir, 'pnpm-workspace.yaml'), 'utf-8'));
      assert.ok(
        updatedPnpm.packages.includes('*/*/*/*'),
        `Expected pnpm packages to include depth 4 (*/*/*/*), got: ${JSON.stringify(updatedPnpm.packages)}`,
      );

      const updatedPkg = JSON.parse(fs.readFileSync(path.join(defaultWsDir, 'package.json'), 'utf-8'));
      assert.ok(
        updatedPkg.workspaces.includes('*/*/*/*'),
        `Expected package.json workspaces to include depth 4 (*/*/*/*), got: ${JSON.stringify(updatedPkg.workspaces)}`,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
