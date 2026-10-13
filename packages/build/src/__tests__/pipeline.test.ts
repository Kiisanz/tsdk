import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TsWorkspace } from '@tsdk/core';
import { BuildService, ReferenceEnforcementError } from '../pipeline/index.js';

describe('Milestone M5: Build Lifecycle & Pipeline', () => {
  it('runs complete lifecycle: restore -> build -> incremental -> clean', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-pipe-lifecycle-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      const apiSrc = path.join(apiDir, 'src');
      const domainSrc = path.join(domainDir, 'src');

      fs.mkdirSync(apiSrc, { recursive: true });
      fs.mkdirSync(domainSrc, { recursive: true });

      // Code in domain
      fs.writeFileSync(
        path.join(domainSrc, 'index.ts'),
        `export function greet(name: string): string { return \`Hello, \${name}!\`; }`,
      );

      // Code in api using package import
      fs.writeFileSync(
        path.join(apiSrc, 'main.ts'),
        `import { greet } from '@acme/domain';
console.log(greet('World'));
`,
      );

      fs.writeFileSync(
        path.join(domainDir, 'package.json'),
        JSON.stringify({
          name: '@acme/domain',
          version: '1.0.0',
          type: 'module',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': {
              types: './dist/index.d.ts',
              default: './dist/index.js',
            },
          },
        }),
      );

      fs.writeFileSync(
        path.join(apiDir, 'package.json'),
        JSON.stringify({ name: '@acme/api', version: '1.0.0', type: 'module' }),
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
defaults:
  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`,
      );

      const workspace = TsWorkspace.loadSync(tswPath);

      // 1. Restore (M3 sync)
      const restoreResult = BuildService.restoreWorkspace(workspace);
      assert.ok(restoreResult.updatedProjects.includes('Acme.Api'));

      const apiPkgJson = JSON.parse(
        fs.readFileSync(path.join(apiDir, 'package.json'), 'utf-8'),
      );
      assert.equal(apiPkgJson.dependencies['@acme/domain'], 'workspace:*');

      // Create a mock node_modules in apiDir linking to domainDir for tsc module resolution
      const apiNodeModules = path.join(apiDir, 'node_modules', '@acme');
      fs.mkdirSync(apiNodeModules, { recursive: true });
      // In pnpm workspace, @acme/domain points to packages/Acme.Domain
      if (!fs.existsSync(path.join(apiNodeModules, 'domain'))) {
        fs.symlinkSync(domainDir, path.join(apiNodeModules, 'domain'), 'junction');
      }

      // 2. Build (M1 + M2 + M4)
      const buildResult = await BuildService.buildWorkspace(workspace);
      assert.equal(buildResult.success, true);
      assert.equal(buildResult.exitCode, 0);

      // Verify outputs exist
      assert.ok(fs.existsSync(path.join(domainDir, 'dist', 'index.js')));
      assert.ok(fs.existsSync(path.join(apiDir, 'dist', 'main.js')));

      // 3. Incremental build
      const incBuild = await BuildService.buildWorkspace(workspace);
      assert.equal(incBuild.success, true);

      // 4. Clean
      await BuildService.cleanWorkspace(workspace);
      assert.ok(!fs.existsSync(path.join(domainDir, 'dist', 'index.js')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('blocks build early when reference enforcement fails', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdk-pipe-enforce-'));

    try {
      const apiDir = path.join(tmpDir, 'apps', 'Acme.Api');
      const domainDir = path.join(tmpDir, 'packages', 'Acme.Domain');
      fs.mkdirSync(path.join(apiDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(domainDir, 'src'), { recursive: true });

      // Acme.Api has illegal relative import across boundaries
      fs.writeFileSync(
        path.join(apiDir, 'src', 'main.ts'),
        `import { foo } from '../../../packages/Acme.Domain/src/index.js';`,
      );

      fs.writeFileSync(
        path.join(domainDir, 'src', 'index.ts'),
        `export const foo = 'bar';`,
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

      // Build must throw ReferenceEnforcementError without running tsc
      await assert.rejects(
        () => BuildService.buildWorkspace(workspace),
        (err: unknown) => {
          assert.ok(err instanceof ReferenceEnforcementError);
          assert.ok(err.message.includes('TSDK2102'));
          return true;
        },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
