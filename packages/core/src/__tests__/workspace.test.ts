import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseWorkspaceYaml, WorkspaceValidationError } from '../workspace/parser.js';
import { TsWorkspace } from '../workspace/workspace.js';

describe('Workspace Manifest (.tswork) Parser and Registry', () => {
  it('parses valid .tswork manifest successfully', () => {
    const yaml = `
schemaVersion: 1
kind: Workspace

metadata:
  name: Acme

projects:
  - path: apps/Acme.Api/Acme.Api.tsproj
  - path: packages/Acme.Domain/Acme.Domain.tsproj

defaults:
  runtime: node

  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`;
    const manifest = parseWorkspaceYaml(yaml, 'Acme.tswork');

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.kind, 'Workspace');
    assert.equal(manifest.metadata.name, 'Acme');
    assert.equal(manifest.projects.length, 2);
    assert.equal(manifest.projects[0].path, 'apps/Acme.Api/Acme.Api.tsproj');
    assert.equal(manifest.projects[1].path, 'packages/Acme.Domain/Acme.Domain.tsproj');
    assert.equal(manifest.defaults?.runtime, 'node');
    assert.equal(manifest.defaults?.compiler?.target, 'ES2022');
  });

  it('rejects invalid schemaVersion or kind', () => {
    const yaml = `
schemaVersion: 2
kind: Workspace
metadata:
  name: Acme
projects:
  - path: foo.tsproj
`;
    assert.throws(
      () => parseWorkspaceYaml(yaml),
      (err: unknown) => err instanceof WorkspaceValidationError && err.message.includes('schemaVersion'),
    );
  });

  it('rejects duplicate project paths in workspace', () => {
    const yaml = `
schemaVersion: 1
kind: Workspace
metadata:
  name: Acme
projects:
  - path: apps/Foo/Foo.tsproj
  - path: apps/Foo/Foo.tsproj
`;
    assert.throws(
      () => parseWorkspaceYaml(yaml),
      (err: unknown) => err instanceof WorkspaceValidationError && err.message.includes('Duplicate project path'),
    );
  });

  it('loads real workspace and applies defaults to projects', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-ws-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.mkdirSync(domainDir, { recursive: true });

      const apiTsp = `
schemaVersion: 1
kind: Project
metadata:
  name: Acme.Api
spec:
  type: webapi
  references:
    - project: Acme.Domain
`;
      const domainTsp = `
schemaVersion: 1
kind: Project
metadata:
  name: Acme.Domain
spec:
  type: library
  compiler:
    target: ES2020
`;
      const acmeTsw = `
schemaVersion: 1
kind: Workspace
metadata:
  name: Acme
projects:
  - path: apps/Acme.Api/Acme.Api.tsproj
  - path: packages/Acme.Domain/Acme.Domain.tsproj
defaults:
  runtime: node
  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`;

      fs.writeFileSync(path.join(apiDir, 'Acme.Api.tsproj'), apiTsp);
      fs.writeFileSync(path.join(domainDir, 'Acme.Domain.tsproj'), domainTsp);
      const tswPath = path.join(tmpDir, 'Acme.tswork');
      fs.writeFileSync(tswPath, acmeTsw);

      const workspace = TsWorkspace.loadSync(tswPath);

      assert.equal(workspace.name, 'Acme');
      assert.equal(workspace.projects.length, 2);

      // Case-insensitive lookup
      const apiProj = workspace.getProject('acme.api');
      assert.ok(apiProj);
      assert.equal(apiProj.name, 'Acme.Api');

      // Defaults inheritance: Acme.Api gets runtime & compiler defaults
      assert.equal(apiProj.runtime, 'node');
      assert.equal(apiProj.manifest.spec.compiler?.target, 'ES2022');
      assert.equal(apiProj.manifest.spec.compiler?.module, 'NodeNext');

      // Project overrides defaults: Acme.Domain overrides target to ES2020
      const domainProj = workspace.getProject('Acme.Domain');
      assert.ok(domainProj);
      assert.equal(domainProj.manifest.spec.compiler?.target, 'ES2020');
      assert.equal(domainProj.manifest.spec.compiler?.module, 'NodeNext');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate project names in workspace (case-insensitive)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-ws-dup-test-'));

    try {
      const p1Dir = path.join(tmpDir, 'p1');
      const p2Dir = path.join(tmpDir, 'p2');
      fs.mkdirSync(p1Dir, { recursive: true });
      fs.mkdirSync(p2Dir, { recursive: true });

      fs.writeFileSync(
        path.join(p1Dir, 'p1.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: MyProject
spec:
  type: library
`,
      );

      fs.writeFileSync(
        path.join(p2Dir, 'p2.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: myproject
spec:
  type: library
`,
      );

      const tswPath = path.join(tmpDir, 'test.tswork');
      fs.writeFileSync(
        tswPath,
        `
schemaVersion: 1
kind: Workspace
metadata:
  name: TestDup
projects:
  - path: p1/p1.tsproj
  - path: p2/p2.tsproj
`,
      );

      assert.throws(
        () => TsWorkspace.loadSync(tswPath),
        (err: unknown) => err instanceof WorkspaceValidationError && err.message.includes('Duplicate project name'),
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
