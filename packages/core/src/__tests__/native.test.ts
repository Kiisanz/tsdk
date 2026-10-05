import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { TsWorkspace } from '../workspace/workspace.js';
import { TsProject } from '../project/project.js';
import { isNativeProject } from '../project/native.js';
import { isNativeWorkspace } from '../workspace/native.js';

describe('Native Project System (tsconfig.json + package.json)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-native-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('isNativeProject detects valid project directory', () => {
    const projDir = path.join(tmpDir, 'MyProject');
    fs.mkdirSync(projDir, { recursive: true });

    assert.strictEqual(isNativeProject(projDir), false);

    fs.writeFileSync(
      path.join(projDir, 'package.json'),
      JSON.stringify({ name: '@scope/my-project', version: '1.0.0' }),
    );
    assert.strictEqual(isNativeProject(projDir), false);

    fs.writeFileSync(
      path.join(projDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { composite: true } }),
    );
    assert.strictEqual(isNativeProject(projDir), true);
  });

  test('loads native project with correct metadata and references', () => {
    const projDir = path.join(tmpDir, 'Domain');
    fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(projDir, 'package.json'),
      JSON.stringify({
        name: '@araserp/domain',
        version: '0.2.0',
        tsnx: {
          name: 'ArasERP.Domain',
          type: 'library',
        },
      }),
    );

    fs.writeFileSync(
      path.join(projDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          composite: true,
          target: 'ES2022',
          module: 'NodeNext',
          rootDir: 'src',
          outDir: 'dist',
        },
        include: ['src/**/*'],
      }),
    );

    const project = TsProject.loadSync(projDir);
    assert.strictEqual(project.name, 'ArasERP.Domain');
    assert.strictEqual(project.version, '0.2.0');
    assert.strictEqual(project.type, 'library');
    assert.strictEqual(project.manifest.spec.package?.name, '@araserp/domain');
    assert.strictEqual(project.manifest.spec.compiler?.target, 'ES2022');
  });

  test('loads native workspace with solution references', () => {
    // 1. Create Host project
    const hostDir = path.join(tmpDir, 'apps', 'ArasERP.Host');
    fs.mkdirSync(path.join(hostDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(hostDir, 'package.json'),
      JSON.stringify({
        name: '@araserp/host',
        tsnx: { name: 'ArasERP.Host', type: 'webapi' },
      }),
    );
    fs.writeFileSync(
      path.join(hostDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { composite: true },
        references: [{ path: '../../packages/Domain' }],
      }),
    );

    // 2. Create Domain project
    const domainDir = path.join(tmpDir, 'packages', 'Domain');
    fs.mkdirSync(path.join(domainDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(domainDir, 'package.json'),
      JSON.stringify({
        name: '@araserp/domain',
        tsnx: { name: 'ArasERP.Domain', type: 'library' },
      }),
    );
    fs.writeFileSync(
      path.join(domainDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { composite: true },
      }),
    );

    // 3. Create Solution root
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'araserp-workspace',
        private: true,
        tsnx: {
          name: 'ArasERP',
          scope: '@araserp',
        },
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        files: [],
        references: [
          { path: './apps/ArasERP.Host' },
          { path: './packages/Domain' },
        ],
      }),
    );

    assert.strictEqual(isNativeWorkspace(tmpDir), true);

    const workspace = TsWorkspace.loadSync(tmpDir);
    assert.strictEqual(workspace.name, 'ArasERP');
    assert.strictEqual(workspace.projects.length, 2);

    const host = workspace.getProject('ArasERP.Host');
    assert.ok(host);
    assert.strictEqual(host.type, 'webapi');
    assert.strictEqual(host.references.length, 1);
    assert.strictEqual(host.references[0].project, 'ArasERP.Domain');

    const domain = workspace.getProject('ArasERP.Domain');
    assert.ok(domain);
    assert.strictEqual(domain.type, 'library');
  });

  test('handles JSONC with comments and trailing commas in tsconfig.json and package.json', () => {
    const wsDir = path.join(tmpDir, 'JsoncWs');
    fs.mkdirSync(wsDir, { recursive: true });

    fs.writeFileSync(
      path.join(wsDir, 'package.json'),
      `{
        // Root package manifest
        "name": "my-jsonc-workspace",
        "private": true,
        "workspaces": [
          "apps/*",
        ],
      }`,
    );

    fs.writeFileSync(
      path.join(wsDir, 'tsconfig.json'),
      `{
        /* Multi-line comment
           for solution config */
        "files": [],
        "references": [
          // Project references here
        ],
      }`,
    );

    assert.strictEqual(isNativeWorkspace(wsDir), true);
    const ws = TsWorkspace.loadSync(wsDir);
    assert.strictEqual(ws.name, 'my-jsonc-workspace');
  });
});
