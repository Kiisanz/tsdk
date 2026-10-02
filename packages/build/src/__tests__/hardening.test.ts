import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectGraph, TsWorkspace } from '@tsnx/core';
import { ConfigGenerator, relPosix } from '../generator/index.js';
import { PackageSyncManager } from '../package/index.js';
import { BuildService, PackageDriftError } from '../pipeline/index.js';

describe('Foundation Hardening: Lifecycle, Paths & Package Consistency', () => {
  it('prunes stale generated tsconfig files when a project is removed or renamed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-harden-prune-'));

    try {
      const p1Dir = path.join(tmpDir, 'P1');
      fs.mkdirSync(path.join(p1Dir, 'src'), { recursive: true });

      fs.writeFileSync(
        path.join(p1Dir, 'P1.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: P1
spec:
  type: library
`,
      );

      const tswPath = path.join(tmpDir, 'Prune.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Prune
projects:
  - path: P1/P1.tsproj
`,
      );

      const ws = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(ws);

      const result = ConfigGenerator.generateWorkspaceConfigs(ws, graph);
      ConfigGenerator.writeGeneratedConfigsSync(result);

      // Create a stale orphaned config left over from a previous project
      const staleFile = path.join(result.generatedDir, 'OldDeletedProject.tsconfig.json');
      fs.writeFileSync(staleFile, '{}', 'utf-8');
      assert.ok(fs.existsSync(staleFile));

      // Regenerate: writeGeneratedConfigsSync must prune the stale file
      ConfigGenerator.writeGeneratedConfigsSync(result);
      assert.ok(!fs.existsSync(staleFile), 'Stale generated tsconfig should have been pruned');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('prunes obsolete workspace:* dependencies when reference is removed from .tsproj', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-harden-sync-'));

    try {
      const appDir = path.join(tmpDir, 'App');
      const libDir = path.join(tmpDir, 'Lib');
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(libDir, { recursive: true });

      // App has package.json with stale @my/lib workspace:* dependency
      fs.writeFileSync(
        path.join(appDir, 'package.json'),
        JSON.stringify({
          name: '@my/app',
          dependencies: {
            '@my/lib': 'workspace:*',
            lodash: '^4.17.21',
          },
        }),
      );

      // But App.tsproj no longer references Lib!
      fs.writeFileSync(
        path.join(appDir, 'App.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: App
spec:
  type: console
  references: []
`,
      );

      fs.writeFileSync(
        path.join(libDir, 'Lib.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: Lib
spec:
  type: library
  package:
    name: "@my/lib"
`,
      );

      const tswPath = path.join(tmpDir, 'Sync.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Sync
projects:
  - path: App/App.tsproj
  - path: Lib/Lib.tsproj
`,
      );

      const ws = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(ws);

      // 1. Validation detects drift (stale dependency)
      const val = PackageSyncManager.validateWorkspacePackages(ws, graph);
      assert.equal(val.valid, false);
      assert.ok(val.drifts.some((d) => d.packageName === '@my/lib' && d.reason === 'stale'));

      // 2. Sync prunes obsolete @my/lib while preserving third-party lodash
      PackageSyncManager.syncWorkspacePackages(ws, graph);

      const updatedAppPkg = JSON.parse(
        fs.readFileSync(path.join(appDir, 'package.json'), 'utf-8'),
      );
      assert.equal(updatedAppPkg.dependencies['@my/lib'], undefined);
      assert.equal(updatedAppPkg.dependencies['lodash'], '^4.17.21');

      // 3. Re-validation is now valid
      const reVal = PackageSyncManager.validateWorkspacePackages(ws, graph);
      assert.equal(reVal.valid, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('fails build early with PackageDriftError when package dependencies are out of sync', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-harden-drift-'));

    try {
      const appDir = path.join(tmpDir, 'App');
      const libDir = path.join(tmpDir, 'Lib');
      fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(libDir, 'src'), { recursive: true });

      fs.writeFileSync(path.join(appDir, 'src', 'main.ts'), 'console.log("ok");');
      fs.writeFileSync(path.join(libDir, 'src', 'index.ts'), 'export const x = 1;');

      fs.writeFileSync(
        path.join(appDir, 'package.json'),
        JSON.stringify({ name: '@my/app', dependencies: {} }),
      );

      // App references Lib in .tsproj, but package.json has not been restored
      fs.writeFileSync(
        path.join(appDir, 'App.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: App
spec:
  type: console
  references:
    - project: Lib
`,
      );

      fs.writeFileSync(
        path.join(libDir, 'Lib.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: Lib
spec:
  type: library
  package:
    name: "@my/lib"
`,
      );

      const tswPath = path.join(tmpDir, 'Drift.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Drift
projects:
  - path: App/App.tsproj
  - path: Lib/Lib.tsproj
`,
      );

      const ws = TsWorkspace.loadSync(tswPath);

      await assert.rejects(
        () => BuildService.buildWorkspace(ws),
        (err: unknown) => {
          assert.ok(err instanceof PackageDriftError);
          assert.ok(err.message.includes('Package dependencies are out of sync'));
          assert.ok(err.message.includes('tsnx restore'));
          return true;
        },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('guarantees POSIX paths in all generated tsconfig fields cross-platform', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-harden-posix-'));

    try {
      const appDir = path.join(tmpDir, 'Nested', 'Sub', 'App');
      fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });

      fs.writeFileSync(
        path.join(appDir, 'App.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: App
spec:
  type: library
`,
      );

      const tswPath = path.join(tmpDir, 'Posix.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Posix
projects:
  - path: Nested/Sub/App/App.tsproj
`,
      );

      const ws = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(ws);

      const result = ConfigGenerator.generateWorkspaceConfigs(ws, graph);
      const appConfig = JSON.parse(
        result.files.find((f) => f.filePath.endsWith('App.tsconfig.json'))!.content,
      );

      // Verify no backslashes in paths
      assert.ok(!appConfig.compilerOptions.rootDir.includes('\\'));
      assert.ok(!appConfig.compilerOptions.outDir.includes('\\'));
      assert.ok(!appConfig.compilerOptions.tsBuildInfoFile.includes('\\'));
      assert.ok(!appConfig.include[0].includes('\\'));
      assert.ok(appConfig.include[0].startsWith('./') || appConfig.include[0].startsWith('../'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('single project build does not prune configs of other projects in .tsnx/generated', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-harden-single-prune-'));

    try {
      const p1Dir = path.join(tmpDir, 'P1');
      const p2Dir = path.join(tmpDir, 'P2');
      fs.mkdirSync(path.join(p1Dir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(p2Dir, 'src'), { recursive: true });

      fs.writeFileSync(
        path.join(p1Dir, 'P1.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: P1
spec:
  type: library
`,
      );

      fs.writeFileSync(
        path.join(p2Dir, 'P2.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: P2
spec:
  type: library
`,
      );

      const tswPath = path.join(tmpDir, 'Multi.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Multi
projects:
  - path: P1/P1.tsproj
  - path: P2/P2.tsproj
`,
      );

      const ws = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(ws);

      // 1. Initial full workspace generation creates both configs
      const fullResult = ConfigGenerator.generateWorkspaceConfigs(ws, graph);
      ConfigGenerator.writeGeneratedConfigsSync(fullResult);

      const p1Config = path.join(fullResult.generatedDir, 'P1.tsconfig.json');
      const p2Config = path.join(fullResult.generatedDir, 'P2.tsconfig.json');
      assert.ok(fs.existsSync(p1Config));
      assert.ok(fs.existsSync(p2Config));

      // 2. Generate and write config in project scope for P1 only
      const p1Project = ws.getProject('P1')!;
      const singleProjResult = ConfigGenerator.generateStandaloneProjectConfig(p1Project, graph);
      // Point generatedDir to the shared workspace generatedDir to simulate building P1 inside the workspace
      singleProjResult.generatedDir = fullResult.generatedDir;
      singleProjResult.scope = 'project';

      ConfigGenerator.writeGeneratedConfigsSync(singleProjResult);

      // P2.tsconfig.json must still exist! Building P1 must not wipe out P2!
      assert.ok(
        fs.existsSync(p2Config),
        'P2.tsconfig.json must NOT be pruned when generating config for project P1',
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('pruning workspace:* strictly preserves manually added non-TSDK workspace:* dependencies', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-harden-manual-ws-'));

    try {
      const appDir = path.join(tmpDir, 'App');
      const libDir = path.join(tmpDir, 'Lib');
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(libDir, { recursive: true });

      // App has package.json with:
      // 1. @my/lib (managed by TSDK, but removed from App.tsproj references)
      // 2. @non-tsdk/manual-tool (manually added workspace:* dependency, NOT a TSDK project in workspace)
      // 3. lodash (standard npm dependency)
      fs.writeFileSync(
        path.join(appDir, 'package.json'),
        JSON.stringify({
          name: '@my/app',
          dependencies: {
            '@my/lib': 'workspace:*',
            '@non-tsdk/manual-tool': 'workspace:*',
            lodash: '^4.17.21',
          },
        }),
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
  references: []
`,
      );

      fs.writeFileSync(
        path.join(libDir, 'Lib.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: Lib
spec:
  type: library
  package:
    name: "@my/lib"
`,
      );

      const tswPath = path.join(tmpDir, 'Manual.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Manual
projects:
  - path: App/App.tsproj
  - path: Lib/Lib.tsproj
`,
      );

      const ws = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(ws);

      // Run sync:
      PackageSyncManager.syncWorkspacePackages(ws, graph);

      const appPkg = JSON.parse(
        fs.readFileSync(path.join(appDir, 'package.json'), 'utf-8'),
      );

      // @my/lib was managed by TSDK and removed -> must be pruned
      assert.equal(appPkg.dependencies['@my/lib'], undefined);

      // @non-tsdk/manual-tool was manually added by developer -> MUST BE PRESERVED!
      assert.equal(appPkg.dependencies['@non-tsdk/manual-tool'], 'workspace:*');

      // lodash must be preserved
      assert.equal(appPkg.dependencies['lodash'], '^4.17.21');

      // Validation must consider this valid and not report @non-tsdk/manual-tool as drift
      const validation = PackageSyncManager.validateWorkspacePackages(ws, graph);
      assert.equal(validation.valid, true);
      assert.equal(validation.drifts.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('validates Windows path resolution, drive letters, backslashes, and cross-platform manifest paths', () => {
    // 1. Test Windows path resolution with path.win32 (drive letters & backslashes)
    const win32From = 'C:\\Users\\User\\Project\\.tsnx\\generated';
    const win32ToSrc = 'C:\\Users\\User\\Project\\apps\\Acme.Api\\src';
    const win32ToDist = 'C:\\Users\\User\\Project\\apps\\Acme.Api\\dist';

    const relSrc = relPosix(win32From, win32ToSrc, path.win32);
    const relDist = relPosix(win32From, win32ToDist, path.win32);

    assert.equal(relSrc, '../../apps/Acme.Api/src');
    assert.equal(relDist, '../../apps/Acme.Api/dist');
    assert.ok(!relSrc.includes('\\'));
    assert.ok(!relDist.includes('\\'));

    // 2. Test manifests referencing files using Windows backslashes
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-harden-win-manifest-'));

    try {
      const appDir = path.join(tmpDir, 'Apps', 'MyApp');
      const libDir = path.join(tmpDir, 'Libs', 'MyLib');
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(libDir, { recursive: true });

      // MyApp references MyLib using Windows backslashes in reference path
      fs.writeFileSync(
        path.join(appDir, 'MyApp.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: MyApp
spec:
  type: console
  references:
    - project: MyLib
      path: ..\\..\\Libs\\MyLib\\MyLib.tsproj
`,
      );

      fs.writeFileSync(
        path.join(libDir, 'MyLib.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: MyLib
spec:
  type: library
`,
      );

      // Workspace projects list using Windows backslashes
      const tswPath = path.join(tmpDir, 'Win.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Win
projects:
  - path: Apps\\MyApp\\MyApp.tsproj
  - path: Libs\\MyLib\\MyLib.tsproj
`,
      );

      const ws = TsWorkspace.loadSync(tswPath);
      assert.equal(ws.projects.length, 2);

      const graph = ProjectGraph.fromWorkspace(ws);
      const buildOrder = graph.getBuildOrder();

      assert.equal(buildOrder.length, 2);
      assert.equal(buildOrder[0].name, 'MyLib');
      assert.equal(buildOrder[1].name, 'MyApp');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

