import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRunArgs } from '../commands/run.js';

const CLI_BIN = fileURLToPath(new URL('../index.js', import.meta.url));

describe('tsnx run command options & workspace execution', () => {
  it('correctly parses CLI arguments and handles "--" separator', () => {
    // 1. --project App
    const r1 = parseRunArgs(['--project', 'App']);
    assert.equal(r1.projectName, 'App');
    assert.equal(r1.noBuild, false);
    assert.deepEqual(r1.appArgs, []);

    // 2. -p App
    const r2 = parseRunArgs(['-p', 'App']);
    assert.equal(r2.projectName, 'App');
    assert.equal(r2.noBuild, false);

    // 3. --project=App
    const r3 = parseRunArgs(['--project=App']);
    assert.equal(r3.projectName, 'App');

    // 4. -p=App
    const r4 = parseRunArgs(['-p=App']);
    assert.equal(r4.projectName, 'App');

    // 5. --no-build flag
    const r5 = parseRunArgs(['--no-build']);
    assert.equal(r5.noBuild, true);
    assert.equal(r5.projectName, undefined);

    // 6. Forwarding arguments after '--'
    const r6 = parseRunArgs(['-p', 'HostApp', '--no-build', '--', '--port', '3000', '--custom']);
    assert.equal(r6.projectName, 'HostApp');
    assert.equal(r6.noBuild, true);
    assert.deepEqual(r6.appArgs, ['--port', '3000', '--custom']);

    // 7. Forwarding flags directly without '--'
    const r7 = parseRunArgs(['-p', 'HostApp', '--foo', 'bar']);
    assert.equal(r7.projectName, 'HostApp');
    assert.deepEqual(r7.appArgs, ['--foo', 'bar']);
  });

  it('runs project from workspace root using --project <name>', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-run-root-'));

    try {
      // 1. Init workspace
      execFileSync(process.execPath, [CLI_BIN, 'workspace', 'init', 'MySolution'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      // 2. Create console project inside workspace
      execFileSync(process.execPath, [CLI_BIN, 'create', 'console', 'HostApp', '--no-install'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      // Update HostApp/src/main.ts
      const mainPath = path.join(tmpDir, 'HostApp', 'src', 'main.ts');
      fs.writeFileSync(mainPath, `console.log('HELLO_FROM_HOST_APP');\n`, 'utf-8');

      // 3. Run from workspace root using --project HostApp
      const output = execFileSync(
        process.execPath,
        [CLI_BIN, 'run', '--project', 'HostApp'],
        {
          cwd: tmpDir,
          encoding: 'utf-8',
        },
      );

      assert.ok(output.includes('[TSNX] Building "HostApp"'));
      assert.ok(output.includes('HELLO_FROM_HOST_APP'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs project from workspace root using -p <name> and forwards arguments after --', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-run-args-'));

    try {
      // 1. Init workspace
      execFileSync(process.execPath, [CLI_BIN, 'workspace', 'init', 'MySolution'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      // 2. Create console project
      execFileSync(process.execPath, [CLI_BIN, 'create', 'console', 'ArgApp', '--no-install'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      // Update main.ts to print received process.argv
      const mainPath = path.join(tmpDir, 'ArgApp', 'src', 'main.ts');
      fs.writeFileSync(
        mainPath,
        `console.log('ARGS:' + JSON.stringify(process.argv.slice(2)));\n`,
        'utf-8',
      );

      // 3. Run: tsnx run -p ArgApp -- --port 3000 --env production
      const output = execFileSync(
        process.execPath,
        [CLI_BIN, 'run', '-p', 'ArgApp', '--', '--port', '3000', '--env', 'production'],
        {
          cwd: tmpDir,
          encoding: 'utf-8',
        },
      );

      assert.ok(output.includes('ARGS:["--port","3000","--env","production"]'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs project from workspace root automatically when only 1 runnable project exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-run-single-'));

    try {
      execFileSync(process.execPath, [CLI_BIN, 'workspace', 'init', 'SingleWs'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      execFileSync(process.execPath, [CLI_BIN, 'create', 'console', 'OnlyApp', '--no-install'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      const mainPath = path.join(tmpDir, 'OnlyApp', 'src', 'main.ts');
      fs.writeFileSync(mainPath, `console.log('ONLY_APP_AUTO_RUN');\n`, 'utf-8');

      // Run `tsnx run` directly from workspace root without --project
      const output = execFileSync(process.execPath, [CLI_BIN, 'run'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      assert.ok(output.includes('ONLY_APP_AUTO_RUN'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('honors --no-build flag and skips compilation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-run-nobuild-'));

    try {
      execFileSync(process.execPath, [CLI_BIN, 'create', 'console', 'QuickApp', '--no-install'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      const appDir = path.join(tmpDir, 'QuickApp');

      // 1. Initial build
      execFileSync(process.execPath, [CLI_BIN, 'build'], {
        cwd: appDir,
        encoding: 'utf-8',
      });

      // 2. Change source file
      const mainPath = path.join(appDir, 'src', 'main.ts');
      fs.writeFileSync(mainPath, `console.log('NEW_MODIFIED_CODE');\n`, 'utf-8');

      // 3. Run with --no-build: should run previous build output, NOT NEW_MODIFIED_CODE
      const output = execFileSync(process.execPath, [CLI_BIN, 'run', '--no-build'], {
        cwd: appDir,
        encoding: 'utf-8',
      });

      assert.ok(!output.includes('[TSNX] Building'));
      assert.ok(output.includes('Hello from QuickApp!'));
      assert.ok(!output.includes('NEW_MODIFIED_CODE'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reports error when project is not found in workspace', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-run-err-'));

    try {
      execFileSync(process.execPath, [CLI_BIN, 'workspace', 'init', 'ErrWs'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      execFileSync(process.execPath, [CLI_BIN, 'create', 'console', 'ExistingApp', '--no-install'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      try {
        execFileSync(process.execPath, [CLI_BIN, 'run', '-p', 'GhostApp'], {
          cwd: tmpDir,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        assert.fail('Should have failed');
      } catch (err: any) {
        const stderr = err.stderr ? err.stderr.toString() : '';
        assert.ok(stderr.includes('Project "GhostApp" not found in workspace "ErrWs"'));
        assert.ok(stderr.includes('ExistingApp (console)'));
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
