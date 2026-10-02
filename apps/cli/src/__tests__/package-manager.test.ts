import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PackageManagerDetector,
  PackageManager,
} from '../scaffolding/package-manager.js';

const CLI_BIN = fileURLToPath(new URL('../index.js', import.meta.url));

describe('PackageManagerDetector', () => {
  it('1. Explicit override takes precedence over lockfiles and packageManager', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-test-'));
    try {
      // Create conflicting conditions
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ packageManager: 'yarn@4.0.0' }),
      );
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');

      const projectDir = path.join(tmpDir, 'MyProject');
      fs.mkdirSync(projectDir);

      const res = PackageManagerDetector.resolve({
        explicitPm: 'pnpm',
        projectDir,
        contextWorkspaceDir: tmpDir,
      });

      assert.equal(res.pm, 'pnpm');
      assert.equal(res.installDir, tmpDir);
      assert.equal(res.isWorkspace, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1b. Throws on unsupported package manager', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-test-'));
    try {
      assert.throws(
        () => {
          PackageManagerDetector.resolve({
            explicitPm: 'deno',
            projectDir: tmpDir,
          });
        },
        /Unsupported package manager "deno"/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('2. Detects package manager from package.json packageManager field', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-test-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ packageManager: 'bun@1.1.0' }),
      );

      const projectDir = path.join(tmpDir, 'MyProject');
      fs.mkdirSync(projectDir);

      const res = PackageManagerDetector.resolve({
        projectDir,
        contextWorkspaceDir: tmpDir,
      });

      assert.equal(res.pm, 'bun');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('3. Detects package manager from lockfiles in root', () => {
    const cases: { file: string; expected: PackageManager }[] = [
      { file: 'pnpm-lock.yaml', expected: 'pnpm' },
      { file: 'package-lock.json', expected: 'npm' },
      { file: 'yarn.lock', expected: 'yarn' },
      { file: 'bun.lock', expected: 'bun' },
      { file: 'bun.lockb', expected: 'bun' },
    ];

    for (const c of cases) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-lock-'));
      try {
        fs.writeFileSync(path.join(tmpDir, c.file), '');
        const res = PackageManagerDetector.resolve({
          projectDir: tmpDir,
        });
        assert.equal(res.pm, c.expected, `Failed for lockfile: ${c.file}`);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it('3b. Handles both bun.lock and bun.lockb without conflicting error', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-bun-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '');
      fs.writeFileSync(path.join(tmpDir, 'bun.lockb'), '');
      const res = PackageManagerDetector.resolve({
        projectDir: tmpDir,
      });
      assert.equal(res.pm, 'bun');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('3c. Detects pnpm from pnpm-workspace.yaml if no lockfile present', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-pws-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"');
      const res = PackageManagerDetector.resolve({
        projectDir: tmpDir,
      });
      assert.equal(res.pm, 'pnpm');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('4. Throws error when conflicting lockfiles exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-conflict-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '');

      assert.throws(
        () => {
          PackageManagerDetector.resolve({
            projectDir: tmpDir,
          });
        },
        /Conflicting lockfiles detected.*pnpm-lock\.yaml.*package-lock\.json/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('5. Defaults to npm when no lockfile or packageManager field exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-default-'));
    try {
      const res = PackageManagerDetector.resolve({
        projectDir: tmpDir,
      });
      assert.equal(res.pm, 'npm');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('6. Resolves workspace root correctly when project is nested inside workspace', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-ws-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'MyApp.tswork'), 'metadata:\n  name: MyApp\n');
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');

      const subDir = path.join(tmpDir, 'packages', 'MyPkg');
      fs.mkdirSync(subDir, { recursive: true });

      const res = PackageManagerDetector.resolve({
        projectDir: subDir,
      });

      assert.equal(res.isWorkspace, true);
      assert.equal(res.installDir, tmpDir);
      assert.equal(res.pm, 'pnpm');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('7. CLI honors --no-install and displays skipped message with next steps', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-cli-'));
    try {
      const output = execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'console', 'SkippedApp', '--no-install'],
        {
          cwd: tmpDir,
          encoding: 'utf-8',
        },
      );

      assert.ok(output.includes('✓ Project scaffolded'));
      assert.ok(output.includes('○ Dependency installation skipped'));
      assert.ok(output.includes('Project created successfully!'));
      assert.ok(output.includes('npm install'));
      assert.ok(output.includes('tsnx run'));

      const projectDir = path.join(tmpDir, 'SkippedApp');
      assert.ok(fs.existsSync(path.join(projectDir, 'package.json')));
      // node_modules should not exist
      assert.ok(!fs.existsSync(path.join(projectDir, 'node_modules')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('8. CLI honors --package-manager and --no-install together', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-pm-cli-'));
    try {
      const output = execFileSync(
        process.execPath,
        [CLI_BIN, 'create', 'library', 'CustomLib', '--package-manager', 'pnpm', '--no-install'],
        {
          cwd: tmpDir,
          encoding: 'utf-8',
        },
      );

      assert.ok(output.includes('✓ Project scaffolded'));
      assert.ok(output.includes('○ Dependency installation skipped'));
      assert.ok(output.includes('Project created successfully!'));
      assert.ok(output.includes('pnpm install'));
      assert.ok(output.includes('tsnx build'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
