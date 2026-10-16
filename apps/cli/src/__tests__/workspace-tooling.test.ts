import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const CLI_BIN = fileURLToPath(new URL('../index.js', import.meta.url));

describe('Workspace Tooling Scaffolding (.gitignore, .editorconfig, linter, formatter)', () => {
  it('generates ESLint + Prettier + .gitignore + .editorconfig by default without flags', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-ws-tooling-default-'));

    try {
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'DefaultToolingWs'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      // 1. .gitignore
      assert.ok(fs.existsSync(path.join(tmpDir, '.gitignore')));
      const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
      assert.ok(gitignore.includes('node_modules/'));
      assert.ok(gitignore.includes('dist/'));
      assert.ok(gitignore.includes('*.tsbuildinfo'));
      assert.ok(gitignore.includes('.tsnx/'));
      assert.ok(gitignore.includes('.env'));

      // 2. .editorconfig
      assert.ok(fs.existsSync(path.join(tmpDir, '.editorconfig')));
      const editorconfig = fs.readFileSync(path.join(tmpDir, '.editorconfig'), 'utf-8');
      assert.ok(editorconfig.includes('indent_size = 2'));
      assert.ok(editorconfig.includes('end_of_line = lf'));

      // 3. Prettier (.prettierrc & .prettierignore)
      assert.ok(fs.existsSync(path.join(tmpDir, '.prettierrc')));
      const prettierrc = JSON.parse(fs.readFileSync(path.join(tmpDir, '.prettierrc'), 'utf-8'));
      assert.equal(prettierrc.singleQuote, true);
      assert.equal(prettierrc.semi, true);
      assert.equal(prettierrc.tabWidth, 2);
      assert.ok(fs.existsSync(path.join(tmpDir, '.prettierignore')));

      // 4. ESLint (eslint.config.mjs)
      assert.ok(fs.existsSync(path.join(tmpDir, 'eslint.config.mjs')));
      const eslintConfig = fs.readFileSync(path.join(tmpDir, 'eslint.config.mjs'), 'utf-8');
      assert.ok(eslintConfig.includes('typescript-eslint'));

      // 5. package.json scripts and devDependencies
      const pkgJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
      assert.equal(pkgJson.scripts.lint, 'eslint .');
      assert.equal(pkgJson.scripts['lint:fix'], 'eslint . --fix');
      assert.equal(pkgJson.scripts.format, 'prettier --write .');
      assert.equal(pkgJson.scripts['format:check'], 'prettier --check .');

      assert.ok(pkgJson.devDependencies.eslint);
      assert.ok(pkgJson.devDependencies['@eslint/js']);
      assert.ok(pkgJson.devDependencies['typescript-eslint']);
      assert.ok(pkgJson.devDependencies.prettier);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports Biome for both linting and formatting (--lint biome --format biome)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-ws-tooling-biome-'));

    try {
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'BiomeWs', '--lint', 'biome', '--format', 'biome'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      // biome.json
      assert.ok(fs.existsSync(path.join(tmpDir, 'biome.json')));
      const biomeConfig = JSON.parse(fs.readFileSync(path.join(tmpDir, 'biome.json'), 'utf-8'));
      assert.equal(biomeConfig.linter.enabled, true);
      assert.equal(biomeConfig.formatter.enabled, true);

      // No eslint or prettier files
      assert.equal(fs.existsSync(path.join(tmpDir, 'eslint.config.mjs')), false);
      assert.equal(fs.existsSync(path.join(tmpDir, '.prettierrc')), false);

      // package.json scripts
      const pkgJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
      assert.equal(pkgJson.scripts.lint, 'biome check .');
      assert.equal(pkgJson.scripts['lint:fix'], 'biome check --write .');
      assert.equal(pkgJson.scripts.format, 'biome format --write .');
      assert.ok(pkgJson.devDependencies['@biomejs/biome']);
      assert.equal(pkgJson.devDependencies.eslint, undefined);
      assert.equal(pkgJson.devDependencies.prettier, undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports hybrid ESLint + Biome formatter (--lint eslint --format biome)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-ws-tooling-hybrid-'));

    try {
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'HybridWs', '--lint', 'eslint', '--format', 'biome'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      assert.ok(fs.existsSync(path.join(tmpDir, 'eslint.config.mjs')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'biome.json')));
      const biomeConfig = JSON.parse(fs.readFileSync(path.join(tmpDir, 'biome.json'), 'utf-8'));
      assert.equal(biomeConfig.linter.enabled, false);
      assert.equal(biomeConfig.formatter.enabled, true);

      const pkgJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
      assert.equal(pkgJson.scripts.lint, 'eslint .');
      assert.equal(pkgJson.scripts.format, 'biome format --write .');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports disabling linter and formatter via --no-lint and --no-format', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-ws-tooling-none-'));

    try {
      execFileSync(
        process.execPath,
        [CLI_BIN, 'workspace', 'init', 'MinimalWs', '--no-lint', '--no-format'],
        { cwd: tmpDir, encoding: 'utf-8' },
      );

      // Essential files still present
      assert.ok(fs.existsSync(path.join(tmpDir, '.gitignore')));
      assert.ok(fs.existsSync(path.join(tmpDir, '.editorconfig')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'tsconfig.json')));
      assert.ok(fs.existsSync(path.join(tmpDir, 'pnpm-workspace.yaml')));

      // Tooling files absent
      assert.equal(fs.existsSync(path.join(tmpDir, 'eslint.config.mjs')), false);
      assert.equal(fs.existsSync(path.join(tmpDir, '.prettierrc')), false);
      assert.equal(fs.existsSync(path.join(tmpDir, 'biome.json')), false);

      const pkgJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
      assert.equal(pkgJson.scripts.lint, undefined);
      assert.equal(pkgJson.scripts.format, undefined);
      assert.equal(pkgJson.devDependencies.eslint, undefined);
      assert.equal(pkgJson.devDependencies.prettier, undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
