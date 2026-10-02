import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { ProjectMapper } from '../project-mapper.js';
import { BridgeManager } from '../bridge/bridge-manager.js';

describe('ProjectMapper', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-mapper-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should map projects from .tswork and determine project for file', async () => {
    const projDir1 = path.join(tmpDir, 'apps', 'Api');
    const projDir2 = path.join(tmpDir, 'packages', 'Domain');
    fs.mkdirSync(path.join(projDir1, 'src', 'Controllers'), { recursive: true });
    fs.mkdirSync(path.join(projDir2, 'src', 'Entities'), { recursive: true });

    fs.writeFileSync(
      path.join(projDir1, 'Api.tsproj'),
      `schemaVersion: 1
kind: Project
metadata:
  name: Api
spec:
  type: webapi
  references:
    - project: Domain
`,
    );

    fs.writeFileSync(
      path.join(projDir2, 'Domain.tsproj'),
      `schemaVersion: 1
kind: Project
metadata:
  name: Domain
spec:
  type: library
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, 'Main.tswork'),
      `schemaVersion: 1
kind: Workspace
metadata:
  name: Main
projects:
  - path: apps/Api/Api.tsproj
  - path: packages/Domain/Domain.tsproj
`,
    );

    // 1. Sync bridge first so generated configs exist
    await BridgeManager.sync(tmpDir);

    // 2. Extract mappings
    const mapping = ProjectMapper.getWorkspaceMapping(tmpDir);
    assert.ok(mapping);
    assert.strictEqual(mapping.projects.length, 2);

    const apiProj = mapping.projects.find((p) => p.name === 'Api');
    assert.ok(apiProj);
    assert.strictEqual(apiProj.references[0], 'Domain');
    assert.strictEqual(apiProj.compilerOptions.target, 'ES2022');
    assert.strictEqual(apiProj.compilerOptions.module, 'NodeNext');

    // 3. Test findProjectForFile
    const apiFile = path.join(projDir1, 'src', 'Controllers', 'UserController.ts');
    const domainFile = path.join(projDir2, 'src', 'Entities', 'User.ts');
    const outsideFile = path.join(tmpDir, 'scripts', 'deploy.ts');

    const matchedApi = ProjectMapper.findProjectForFile(mapping, apiFile);
    assert.strictEqual(matchedApi?.name, 'Api');

    const matchedDomain = ProjectMapper.findProjectForFile(mapping, domainFile);
    assert.strictEqual(matchedDomain?.name, 'Domain');

    const matchedOutside = ProjectMapper.findProjectForFile(mapping, outsideFile);
    assert.strictEqual(matchedOutside, undefined);
  });
});
