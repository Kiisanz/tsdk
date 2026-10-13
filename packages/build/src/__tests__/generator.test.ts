import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectGraph, TsWorkspace } from '@tsdk/core';
import { ConfigGenerator } from '../generator/index.js';

describe('Milestone M1: Compiler Config Generator', () => {
  it('generates workspace tsconfig solution and project configs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-gen-ws-test-'));

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
defaults:
  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const graph = ProjectGraph.fromWorkspace(workspace);

      const result = ConfigGenerator.generateWorkspaceConfigs(workspace, graph);
      ConfigGenerator.writeGeneratedConfigsSync(result);

      // Verify directory structure
      assert.equal(result.generatedDir, path.join(tmpDir, '.tsdk', 'generated'));
      assert.ok(fs.existsSync(path.join(result.generatedDir, 'tsconfig.json')));
      assert.ok(fs.existsSync(path.join(result.generatedDir, 'Acme.Api.tsconfig.json')));
      assert.ok(fs.existsSync(path.join(result.generatedDir, 'Acme.Domain.tsconfig.json')));

      // Verify root tsconfig
      const rootConfig = JSON.parse(
        fs.readFileSync(path.join(result.generatedDir, 'tsconfig.json'), 'utf-8'),
      );
      assert.deepEqual(rootConfig.files, []);
      assert.equal(rootConfig.references.length, 2);
      assert.ok(rootConfig.references.some((r: any) => r.path === './Acme.Api.tsconfig.json'));
      assert.ok(rootConfig.references.some((r: any) => r.path === './Acme.Domain.tsconfig.json'));

      // Verify Acme.Api project tsconfig
      const apiConfig = JSON.parse(
        fs.readFileSync(path.join(result.generatedDir, 'Acme.Api.tsconfig.json'), 'utf-8'),
      );
      assert.equal(apiConfig.compilerOptions.composite, true);
      assert.equal(apiConfig.compilerOptions.declaration, true);
      assert.equal(apiConfig.compilerOptions.target, 'ES2022');
      assert.equal(apiConfig.compilerOptions.module, 'NodeNext');
      assert.equal(apiConfig.compilerOptions.strict, true);
      assert.equal(apiConfig.references.length, 1);
      assert.equal(apiConfig.references[0].path, './Acme.Domain.tsconfig.json');

      // Verify Acme.Domain project tsconfig (no references)
      const domainConfig = JSON.parse(
        fs.readFileSync(path.join(result.generatedDir, 'Acme.Domain.tsconfig.json'), 'utf-8'),
      );
      assert.equal(domainConfig.compilerOptions.composite, true);
      assert.equal(domainConfig.references, undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
