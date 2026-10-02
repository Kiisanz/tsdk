import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { BridgeManager } from '../bridge/bridge-manager.js';

describe('BridgeManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-vscode-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should return scope none when no manifest exists', async () => {
    const res = await BridgeManager.sync(tmpDir);
    assert.strictEqual(res.scope, 'none');
    assert.strictEqual(res.projectCount, 0);
  });

  test('should synchronize workspace with multiple projects', async () => {
    // Create workspace structure
    const projDir1 = path.join(tmpDir, 'apps', 'Api');
    const projDir2 = path.join(tmpDir, 'packages', 'Core');
    fs.mkdirSync(path.join(projDir1, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projDir2, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(projDir1, 'Api.tsproj'),
      `schemaVersion: 1
kind: Project
metadata:
  name: Api
spec:
  type: webapi
  references:
    - project: Core
`,
    );

    fs.writeFileSync(
      path.join(projDir2, 'Core.tsproj'),
      `schemaVersion: 1
kind: Project
metadata:
  name: Core
spec:
  type: library
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, 'Acme.tswork'),
      `schemaVersion: 1
kind: Workspace
metadata:
  name: Acme
projects:
  - path: apps/Api/Api.tsproj
  - path: packages/Core/Core.tsproj
`,
    );

    const res = await BridgeManager.sync(tmpDir);

    assert.strictEqual(res.scope, 'workspace');
    assert.strictEqual(res.projectCount, 2);
    assert.deepStrictEqual(res.projectNames, ['Api', 'Core']);

    // Check generated files
    assert.ok(fs.existsSync(path.join(tmpDir, '.tsnx', 'generated', 'Api.tsconfig.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.tsnx', 'generated', 'Core.tsconfig.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'tsconfig.json')));

    // Check root tsconfig references
    const rootConfig = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tsconfig.json'), 'utf8'));
    assert.strictEqual(rootConfig.references.length, 2);

    // Check .gitignore
    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('tsconfig.json'));
    assert.ok(gitignore.includes('.tsnx/'));
  });

  test('should synchronize standalone project', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'Single.tsproj'),
      `schemaVersion: 1
kind: Project
metadata:
  name: Single
spec:
  type: console
`,
    );

    const res = await BridgeManager.sync(tmpDir);

    assert.strictEqual(res.scope, 'standalone');
    assert.strictEqual(res.projectCount, 1);
    assert.strictEqual(res.projectNames[0], 'Single');

    assert.ok(fs.existsSync(path.join(tmpDir, '.tsnx', 'generated', 'tsconfig.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'tsconfig.json')));
  });
});
