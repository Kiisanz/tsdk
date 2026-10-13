import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TsWorkspace } from '@tsnx/core';
import { ImportValidator } from '../validator/index.js';

describe('Milestone M4: Reference Enforcement (AST-based Import Validator)', () => {
  it('allows internal imports and declared direct references', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-val-ok-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      fs.mkdirSync(path.join(apiDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(domainDir, 'src'), { recursive: true });

      // Domain code
      fs.writeFileSync(
        path.join(domainDir, 'src', 'index.ts'),
        `export const DOMAIN_CONST = 42;`,
      );

      // Api code with internal relative import and declared package import
      fs.writeFileSync(
        path.join(apiDir, 'src', 'helper.ts'),
        `export const helper = true;`,
      );
      fs.writeFileSync(
        path.join(apiDir, 'src', 'main.ts'),
        `import { helper } from './helper.js';
import type { helper as H } from './helper.js';
import { DOMAIN_CONST } from '@acme/domain';
console.log(helper, DOMAIN_CONST);
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
      const validation = ImportValidator.validateWorkspace(workspace);

      assert.equal(validation.valid, true);
      assert.equal(validation.diagnostics.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects cross-project relative import with TSNX2102', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-val-rel-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      fs.mkdirSync(path.join(apiDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(domainDir, 'src'), { recursive: true });

      // Acme.Api tries to do relative import crossing boundaries
      fs.writeFileSync(
        path.join(apiDir, 'src', 'main.ts'),
        `import { foo } from '../../../packages/Acme.Domain/src/index.js';`,
      );

      fs.writeFileSync(
        path.join(domainDir, 'src', 'index.ts'),
        `export const foo = 1;`,
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
      const validation = ImportValidator.validateWorkspace(workspace);

      assert.equal(validation.valid, false);
      const diag2102 = validation.diagnostics.find((d) => d.code === 'TSNX2102');
      assert.ok(diag2102);
      assert.equal(diag2102.sourceProject, 'Acme.Api');
      assert.equal(diag2102.targetProject, 'Acme.Domain');
      assert.ok(diag2102.fixSuggestion?.includes('@acme/domain'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects undeclared project reference with TSNX2101 and fix suggestion', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-val-und-test-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const infraDir = path.join(tmpDir, 'packages', 'Acme.Infra');
      fs.mkdirSync(path.join(apiDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(infraDir, 'src'), { recursive: true });

      // Api imports @acme/infra but Acme.Api.tsproj does NOT list Acme.Infra in references
      fs.writeFileSync(
        path.join(apiDir, 'src', 'main.ts'),
        `import { db } from '@acme/infra';`,
      );

      fs.writeFileSync(
        path.join(infraDir, 'src', 'index.ts'),
        `export const db = 'connected';`,
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
  references: []
`,
      );

      fs.writeFileSync(
        path.join(infraDir, 'Acme.Infra.tsproj'),
        `
schemaVersion: 1
kind: Project
metadata:
  name: Acme.Infra
spec:
  type: library
  package:
    name: "@acme/infra"
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
  - path: packages/Acme.Infra/Acme.Infra.tsproj
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);
      const validation = ImportValidator.validateWorkspace(workspace);

      assert.equal(validation.valid, false);
      const diag2101 = validation.diagnostics.find((d) => d.code === 'TSNX2101');
      assert.ok(diag2101);
      assert.equal(diag2101.sourceProject, 'Acme.Api');
      assert.equal(diag2101.targetProject, 'Acme.Infra');
      assert.equal(diag2101.fixSuggestion, 'tsnx ref add Acme.Infra');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
