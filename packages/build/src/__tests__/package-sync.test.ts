import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectGraph, TsWorkspace } from '@tsnx/core';
import { PackageSyncManager } from '../package/index.js';

describe('Milestone M3: Package Integration (Sync & Validation)', () => {
  it('synchronizes declared references to package.json as workspace:* idempotently', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-pkg-sync-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.mkdirSync(domainDir, { recursive: true });

      // Existing package.json in Acme.Api with custom scripts and dependencies
      const initialApiPkgJson = {
        name: '@acme/api',
        version: '1.0.0',
        scripts: { start: 'node dist/main.js' },
        dependencies: {
          express: '^4.18.2',
        },
      };
      fs.writeFileSync(
        path.join(apiDir, 'package.json'),
        JSON.stringify(initialApiPkgJson, null, 2),
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
  package:
    name: "@acme/api"
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
  package:
    name: "@acme/domain"
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
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(workspace);

      // 1. First sync: should update Acme.Api
      const syncResult1 = PackageSyncManager.syncWorkspacePackages(workspace, graph);
      assert.ok(syncResult1.updatedProjects.includes('Acme.Api'));

      const updatedApiPkg = JSON.parse(
        fs.readFileSync(path.join(apiDir, 'package.json'), 'utf-8'),
      );
      // Existing fields preserved
      assert.equal(updatedApiPkg.scripts.start, 'node dist/main.js');
      assert.equal(updatedApiPkg.dependencies.express, '^4.18.2');
      // Added workspace:*
      assert.equal(updatedApiPkg.dependencies['@acme/domain'], 'workspace:*');

      // 2. Validate
      const validation = PackageSyncManager.validateWorkspacePackages(workspace, graph);
      assert.equal(validation.valid, true);

      // 3. Second sync: idempotent, no changes
      const syncResult2 = PackageSyncManager.syncWorkspacePackages(workspace, graph);
      assert.equal(syncResult2.updatedProjects.length, 0);
      assert.ok(syncResult2.unchangedProjects.includes('Acme.Api'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects missing package dependency when package.json is not synced', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-pkg-val-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.mkdirSync(domainDir, { recursive: true });

      fs.writeFileSync(
        path.join(apiDir, 'package.json'),
        JSON.stringify({ name: '@acme/api', dependencies: {} }),
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
  package:
    name: "@acme/domain"
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
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(workspace);

      const validation = PackageSyncManager.validateWorkspacePackages(workspace, graph);
      assert.equal(validation.valid, false);
      assert.equal(validation.missingDependencies.length, 1);
      assert.equal(validation.missingDependencies[0].expectedPackage, '@acme/domain');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
