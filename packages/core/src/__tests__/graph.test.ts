import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CircularDependencyError,
  ProjectGraph,
  ReferenceResolutionError,
  TsProject,
  TsWorkspace,
} from '../index.js';

describe('ProjectGraph & References Engine', () => {
  it('resolves in-workspace references and calculates build order', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-graph-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.mkdirSync(domainDir, { recursive: true });

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
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(workspace);

      // Build order must place dependencies before dependents: Acme.Domain first, then Acme.Api
      const buildOrder = graph.getBuildOrder();
      assert.equal(buildOrder.length, 2);
      assert.equal(buildOrder[0].name, 'Acme.Domain');
      assert.equal(buildOrder[1].name, 'Acme.Api');

      // Dependencies & Dependents
      const apiDeps = graph.getDependencies('Acme.Api');
      assert.equal(apiDeps.length, 1);
      assert.equal(apiDeps[0].name, 'Acme.Domain');

      const domainDependents = graph.getDependents('Acme.Domain');
      assert.equal(domainDependents.length, 1);
      assert.equal(domainDependents[0].name, 'Acme.Api');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects 2-node circular dependency (A -> B -> A)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-cycle2-test-'));

    try {
      const aDir = path.join(tmpDir, 'A');
      const bDir = path.join(tmpDir, 'B');
      fs.mkdirSync(aDir, { recursive: true });
      fs.mkdirSync(bDir, { recursive: true });

      fs.writeFileSync(
        path.join(aDir, 'A.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: ProjectA
spec:
  type: library
  references:
    - project: ProjectB
`,
      );

      fs.writeFileSync(
        path.join(bDir, 'B.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: ProjectB
spec:
  type: library
  references:
    - project: ProjectA
`,
      );

      const tswPath = path.join(tmpDir, 'Cycle.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Cycle
projects:
  - path: A/A.tsproj
  - path: B/B.tsproj
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);

      assert.throws(
        () => ProjectGraph.fromWorkspace(workspace),
        (err: unknown) => {
          assert.ok(err instanceof CircularDependencyError);
          assert.ok(err.message.includes('ProjectA'));
          assert.ok(err.message.includes('ProjectB'));
          return true;
        },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects 3-node circular dependency (A -> B -> C -> A)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-cycle3-test-'));

    try {
      const aDir = path.join(tmpDir, 'A');
      const bDir = path.join(tmpDir, 'B');
      const cDir = path.join(tmpDir, 'C');
      fs.mkdirSync(aDir, { recursive: true });
      fs.mkdirSync(bDir, { recursive: true });
      fs.mkdirSync(cDir, { recursive: true });

      fs.writeFileSync(
        path.join(aDir, 'A.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: ProjectA
spec:
  type: library
  references:
    - project: ProjectB
`,
      );

      fs.writeFileSync(
        path.join(bDir, 'B.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: ProjectB
spec:
  type: library
  references:
    - project: ProjectC
`,
      );

      fs.writeFileSync(
        path.join(cDir, 'C.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: ProjectC
spec:
  type: library
  references:
    - project: ProjectA
`,
      );

      const tswPath = path.join(tmpDir, 'Cycle.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: Cycle
projects:
  - path: A/A.tsproj
  - path: B/B.tsproj
  - path: C/C.tsproj
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);

      assert.throws(
        () => ProjectGraph.fromWorkspace(workspace),
        (err: unknown) => {
          assert.ok(err instanceof CircularDependencyError);
          assert.ok(err.cyclePath.length >= 3);
          return true;
        },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects in-workspace reference when path does not match registry', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-path-mismatch-test-'));

    try {
      const aDir = path.join(tmpDir, 'A');
      const bDir = path.join(tmpDir, 'B');
      fs.mkdirSync(aDir, { recursive: true });
      fs.mkdirSync(bDir, { recursive: true });

      fs.writeFileSync(
        path.join(aDir, 'A.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: ProjectA
spec:
  type: library
  references:
    - project: ProjectB
      path: ../WrongPath/B.tsproj
`,
      );

      fs.writeFileSync(
        path.join(bDir, 'B.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: ProjectB
spec:
  type: library
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
  - path: A/A.tsproj
  - path: B/B.tsproj
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);

      assert.throws(
        () => ProjectGraph.fromWorkspace(workspace),
        (err: unknown) =>
          err instanceof ReferenceResolutionError && err.message.includes('does not match registered workspace location'),
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('resolves standalone project reference with explicit path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-standalone-test-'));

    try {
      const appDir = path.join(tmpDir, 'App');
      const libDir = path.join(tmpDir, 'Lib');
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(libDir, { recursive: true });

      const appTspPath = path.join(appDir, 'App.tsproj');
      const libTspPath = path.join(libDir, 'Lib.tsproj');

      fs.writeFileSync(
        appTspPath,
        `
schemaVersion: 1
kind: Project
metadata:
  name: StandaloneApp
spec:
  type: console
  references:
    - project: SharedLib
      path: ../Lib/Lib.tsproj
`,
      );

      fs.writeFileSync(
        libTspPath,
        `
schemaVersion: 1
kind: Project
metadata:
  name: SharedLib
spec:
  type: library
`,
      );

      const appProj = TsProject.loadSync(appTspPath);
      const graph = ProjectGraph.fromProject(appProj);

      const order = graph.getBuildOrder();
      assert.equal(order.length, 2);
      assert.equal(order[0].name, 'SharedLib');
      assert.equal(order[1].name, 'StandaloneApp');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects standalone reference without path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-standalone-nopath-test-'));

    try {
      const appDir = path.join(tmpDir, 'App');
      fs.mkdirSync(appDir, { recursive: true });

      const appTspPath = path.join(appDir, 'App.tsproj');
      fs.writeFileSync(
        appTspPath,
        `
schemaVersion: 1
kind: Project
metadata:
  name: StandaloneApp
spec:
  type: console
  references:
    - project: MissingLib
`,
      );

      const appProj = TsProject.loadSync(appTspPath);
      assert.throws(
        () => ProjectGraph.fromProject(appProj),
        (err: unknown) =>
          err instanceof ReferenceResolutionError && err.message.includes('must provide a "path" attribute'),
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
