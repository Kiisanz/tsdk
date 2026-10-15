import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectGraph, TsWorkspace } from '@tsnx/core';
import { BuildError, BuildOrchestrator } from '../orchestrator/index.js';

describe('Milestone M2: Build Orchestrator', () => {
  it('builds multi-project workspace and outputs js/dts in dist/', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-build-ws-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      const apiSrc = path.join(apiDir, 'src');
      const domainSrc = path.join(domainDir, 'src');

      fs.mkdirSync(apiSrc, { recursive: true });
      fs.mkdirSync(domainSrc, { recursive: true });

      // Domain code
      fs.writeFileSync(
        path.join(domainSrc, 'index.ts'),
        `export interface User { id: string; name: string; }
export function createUser(name: string): User { return { id: '1', name }; }
`,
      );

      // Api code (references Domain)
      fs.writeFileSync(
        path.join(apiSrc, 'main.ts'),
        `import { createUser } from '../../../packages/Acme.Domain/src/index.js';
console.log(createUser('Alice'));
`,
      );

      fs.writeFileSync(
        path.join(apiDir, 'Acme.Api.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: Acme.Api
spec:
  type: webapi
  references:
    - project: Acme.Domain
`,
      );

      fs.writeFileSync(
        path.join(domainDir, 'Acme.Domain.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: Acme.Domain
spec:
  type: library
`,
      );

      const tswPath = path.join(tmpDir, 'Acme.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Acme
projects:
  - path: apps/Acme.Api/Acme.Api.tsproj
  - path: packages/Acme.Domain/Acme.Domain.tsproj
defaults:
  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(workspace);

      // 1. Initial build
      const buildResult = await BuildOrchestrator.buildWorkspace(workspace, graph);
      assert.equal(buildResult.success, true);
      assert.equal(buildResult.exitCode, 0);

      // Verify Domain dist output
      assert.ok(fs.existsSync(path.join(domainDir, 'dist', 'index.js')));
      assert.ok(fs.existsSync(path.join(domainDir, 'dist', 'index.d.ts')));
      assert.ok(fs.existsSync(path.join(domainDir, 'dist', '.tsbuildinfo')));

      // Verify Api dist output
      assert.ok(fs.existsSync(path.join(apiDir, 'dist', 'main.js')));
      assert.ok(fs.existsSync(path.join(apiDir, 'dist', 'main.d.ts')));
      assert.ok(fs.existsSync(path.join(apiDir, 'dist', '.tsbuildinfo')));

      // 2. Incremental second build (should succeed quickly)
      const secondBuild = await BuildOrchestrator.buildWorkspace(workspace, graph);
      assert.equal(secondBuild.success, true);
      assert.equal(secondBuild.exitCode, 0);

      // 3. Clean
      await BuildOrchestrator.cleanWorkspace(workspace, graph);
      assert.ok(!fs.existsSync(path.join(domainDir, 'dist', 'index.js')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('fails with BuildError and non-zero exit code when compiler error occurs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-build-err-test-'));

    try {
      const appDir = path.join(tmpDir, 'App');
      const srcDir = path.join(appDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Code with type error
      fs.writeFileSync(
        path.join(srcDir, 'index.ts'),
        `const x: number = "this is not a number";
`,
      );

      fs.writeFileSync(
        path.join(appDir, 'App.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: App
spec:
  type: console
`,
      );

      const tswPath = path.join(tmpDir, 'Test.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Test
projects:
  - path: App/App.tsproj
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(workspace);

      await assert.rejects(
        () => BuildOrchestrator.buildWorkspace(workspace, graph),
        (err: unknown) => {
          assert.ok(err instanceof BuildError);
          assert.notEqual(err.exitCode, 0);
          assert.ok(err.output.includes('TS2322')); // Type 'string' is not assignable to type 'number'
          return true;
        },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('successfully builds workspace projects importing node:process without local @types/node', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-build-node-types-'));

    try {
      const hostDir = path.join(tmpDir, 'ArasHRMS.Host');
      const srcDir = path.join(hostDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Code importing node:process directly
      fs.writeFileSync(
        path.join(srcDir, 'main.ts'),
        `import process from 'node:process';
console.log('Process ID:', process.pid);
`,
      );

      fs.writeFileSync(
        path.join(hostDir, 'ArasHRMS.Host.tsproj'),
        `schemaVersion: 1
kind: Project
metadata:
  name: ArasHRMS.Host
spec:
  type: console
`,
      );

      const tswPath = path.join(tmpDir, 'ArasHRMS.tswork');
      fs.writeFileSync(
        tswPath,
        `schemaVersion: 1
kind: Workspace
metadata:
  name: ArasHRMS
projects:
  - path: ArasHRMS.Host/ArasHRMS.Host.tsproj
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(workspace);

      // Should succeed using fallback typeRoots from @tsnx/build
      const result = await BuildOrchestrator.buildWorkspace(workspace, graph);
      assert.ok(result.success);
      assert.ok(fs.existsSync(path.join(hostDir, 'dist', 'main.js')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('M-15 & I-01: tests BuildOrchestrator.executeTsc and signal exit mapping', async () => {
    // 1. Direct execution of executeTsc with valid arguments
    const tscVersion = await BuildOrchestrator.executeTsc(['--version'], process.cwd());
    assert.equal(tscVersion.exitCode, 0);
    assert.ok(tscVersion.output.toLowerCase().includes('version'));

    // 2. Direct unit testing of production parseProcessExit method
    const sigtermParsed = BuildOrchestrator.parseProcessExit(null, 'SIGTERM', 'some log', 'error log');
    assert.equal(sigtermParsed.exitCode, 143, 'Exit code for SIGTERM must be 128 + 15 = 143');
    assert.ok(sigtermParsed.output.includes('Compilation terminated by signal: SIGTERM'));

    const sigintParsed = BuildOrchestrator.parseProcessExit(null, 'SIGINT', '', '');
    assert.equal(sigintParsed.exitCode, 130, 'Exit code for SIGINT must be 128 + 2 = 130');
    assert.ok(sigintParsed.output.includes('Compilation terminated by signal: SIGINT'));

    const normalExit = BuildOrchestrator.parseProcessExit(0, null, 'success', '');
    assert.equal(normalExit.exitCode, 0);
    assert.equal(normalExit.output, 'success');

    // 3. Integration test with a real spawned process terminated by SIGTERM (POSIX only)
    if (process.platform !== 'win32') {
      const child = spawn(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM");']);
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      const result = await new Promise<{ exitCode: number; output: string }>((resolve) => {
        child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
          resolve(BuildOrchestrator.parseProcessExit(code, signal, stdout, stderr));
        });
      });

      assert.equal(result.exitCode, 143, 'Exit code for SIGTERM must be 128 + 15 = 143');
      assert.ok(result.output.includes('Compilation terminated by signal: SIGTERM'));
    }
  });
});

