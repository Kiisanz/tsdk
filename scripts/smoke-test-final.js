import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot = path.resolve(__dirname, '..');

function logStep(step, message) {
  console.log(`\n======================================================`);
  console.log(`STEP [${step}]: ${message}`);
  console.log(`======================================================`);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body,
        });
      });
    }).on('error', reject);
  });
}

async function runSmokeTest() {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-smoke-pack-'));
  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-smoke-consumer-'));

  try {
    // 1. Pack all monorepo packages to tarballs
    logStep(1, 'Packing monorepo packages to local tarballs');
    const packagesToPack = [
      { name: '@tsnx/core', dir: path.join(monorepoRoot, 'packages/core') },
      { name: '@tsnx/hosting-abstractions', dir: path.join(monorepoRoot, 'packages/hosting-abstractions') },
      { name: '@tsnx/hosting', dir: path.join(monorepoRoot, 'packages/hosting') },
      { name: '@tsnx/build', dir: path.join(monorepoRoot, 'packages/build') },
      { name: '@tsnx/web', dir: path.join(monorepoRoot, 'packages/web') },
      { name: '@tsnx/openapi', dir: path.join(monorepoRoot, 'packages/openapi') },
      { name: '@tsnx/scalar', dir: path.join(monorepoRoot, 'packages/scalar') },
      { name: '@tsnx/cli', dir: path.join(monorepoRoot, 'apps/cli') },
    ];

    const tarballs = {};
    for (const pkg of packagesToPack) {
      console.log(`Packing ${pkg.name}...`);
      const out = execFileSync('pnpm', ['pack', '--pack-destination', stageDir], {
        cwd: pkg.dir,
        encoding: 'utf-8',
      });
      const tarballName = out.trim().split('\n').pop().trim();
      tarballs[pkg.name] = path.resolve(stageDir, path.basename(tarballName));
      console.log(`  -> ${tarballs[pkg.name]}`);
    }

    const cliBin = path.join(monorepoRoot, 'apps/cli/dist/index.js');

    // 2. CREATE workspace using tsnx workspace init
    logStep(2, 'Creating workspace SmokeSolution');
    execFileSync(process.execPath, [cliBin, 'workspace', 'init', 'SmokeSolution'], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    const wsDir = consumerDir; // created in current directory or target
    console.log('Verifying generated workspace files in:', wsDir);
    const expectedFiles = [
      'package.json',
      'tsconfig.json',
      'pnpm-workspace.yaml',
      '.gitignore',
      '.editorconfig',
      '.prettierrc',
      '.prettierignore',
      'eslint.config.mjs',
    ];
    for (const f of expectedFiles) {
      if (!fs.existsSync(path.join(wsDir, f))) {
        throw new Error(`Expected file "${f}" not found in workspace!`);
      }
      console.log(`  ✓ ${f} present`);
    }

    // 3. CREATE webapi project and library project
    logStep(3, 'Scaffolding projects: ApiHost (webapi) and CoreLib (library)');
    execFileSync(process.execPath, [cliBin, 'create', 'webapi', 'ApiHost', '-o', 'apps/ApiHost', '--no-install'], {
      cwd: wsDir,
      stdio: 'inherit',
    });
    execFileSync(process.execPath, [cliBin, 'create', 'library', 'CoreLib', '-o', 'packages/CoreLib', '--no-install'], {
      cwd: wsDir,
      stdio: 'inherit',
    });

    // 4. WIRE dependencies with tsnx ref add
    logStep(4, 'Wiring project reference: ApiHost -> CoreLib');
    execFileSync(process.execPath, [cliBin, 'ref', 'add', 'CoreLib'], {
      cwd: path.join(wsDir, 'apps/ApiHost'),
      stdio: 'inherit',
    });

    // Add business code in CoreLib
    const coreLibSrc = path.join(wsDir, 'packages/CoreLib/src/index.ts');
    fs.writeFileSync(
      coreLibSrc,
      `export function getGreeting(name: string): string {\n  return \`Welcome to \${name}!\`;\n}\n`,
      'utf-8',
    );
    console.log('✓ Added business function getGreeting in packages/CoreLib/src/index.ts');

    // Consume CoreLib in ApiHost
    const apiHostMain = path.join(wsDir, 'apps/ApiHost/src/main.ts');
    const apiHostCode = `import process from 'node:process';
import { WebApplication, Results } from '@tsnx/web';
import { getGreeting } from '@smokesolution/core-lib';

const builder = WebApplication.createBuilder(process.argv.slice(2));
const port = 3888;
builder.configureServer({ port, host: '127.0.0.1' });

const app = builder.build();

app.mapGet('/', () => {
  return Results.json({ message: getGreeting('Smoke Final API') });
});

app.mapGet('/health', () => {
  return Results.json({ status: 'ok', timestamp: new Date().toISOString() });
});

await app.run();
`;
    fs.writeFileSync(apiHostMain, apiHostCode, 'utf-8');
    console.log('✓ Updated apps/ApiHost/src/main.ts to call getGreeting and bind to port 3888');

    // Point dependencies in workspace to local tarballs
    logStep(5, 'Configuring package dependencies to local tarballs and installing');
    // Root package.json needs resolutions
    const rootPkgPath = path.join(wsDir, 'package.json');
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
    rootPkg.resolutions = {
      '@tsnx/core': `file:${tarballs['@tsnx/core']}`,
      '@tsnx/hosting-abstractions': `file:${tarballs['@tsnx/hosting-abstractions']}`,
      '@tsnx/hosting': `file:${tarballs['@tsnx/hosting']}`,
      '@tsnx/build': `file:${tarballs['@tsnx/build']}`,
      '@tsnx/web': `file:${tarballs['@tsnx/web']}`,
      '@tsnx/openapi': `file:${tarballs['@tsnx/openapi']}`,
      '@tsnx/scalar': `file:${tarballs['@tsnx/scalar']}`,
      '@tsnx/cli': `file:${tarballs['@tsnx/cli']}`,
    };
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8');

    // Also update ApiHost package.json dependencies to file tarballs
    const apiHostPkgPath = path.join(wsDir, 'apps/ApiHost/package.json');
    const apiHostPkg = JSON.parse(fs.readFileSync(apiHostPkgPath, 'utf-8'));
    apiHostPkg.dependencies['@tsnx/web'] = `file:${tarballs['@tsnx/web']}`;
    fs.writeFileSync(apiHostPkgPath, JSON.stringify(apiHostPkg, null, 2) + '\n', 'utf-8');

    // Create .pnpmfile.cjs to override all transitive monorepo package resolutions
    const pnpmFileContent = `module.exports = {
  hooks: {
    readPackage(pkg) {
      const tarballs = ${JSON.stringify(tarballs)};
      for (const [dep, tgz] of Object.entries(tarballs)) {
        if (pkg.dependencies && pkg.dependencies[dep]) {
          pkg.dependencies[dep] = 'file:' + tgz;
        }
        if (pkg.devDependencies && pkg.devDependencies[dep]) {
          pkg.devDependencies[dep] = 'file:' + tgz;
        }
      }
      return pkg;
    }
  }
};
`;
    fs.writeFileSync(path.join(wsDir, '.pnpmfile.cjs'), pnpmFileContent, 'utf-8');

    console.log('Running pnpm install in consumer workspace...');
    execFileSync('pnpm', ['install', '--no-frozen-lockfile'], {
      cwd: wsDir,
      stdio: 'inherit',
    });
    console.log('✓ pnpm install succeeded');

    // 6. BUILD workspace with tsc -b
    logStep(6, 'Building consumer workspace (tsc -b)');
    execFileSync('pnpm', ['run', 'build'], {
      cwd: wsDir,
      stdio: 'inherit',
    });
    console.log('✓ Build succeeded! dist/ outputs verified:');
    if (!fs.existsSync(path.join(wsDir, 'apps/ApiHost/dist/main.js'))) {
      throw new Error('apps/ApiHost/dist/main.js was not generated!');
    }
    if (!fs.existsSync(path.join(wsDir, 'packages/CoreLib/dist/index.js'))) {
      throw new Error('packages/CoreLib/dist/index.js was not generated!');
    }
    console.log('  ✓ apps/ApiHost/dist/main.js');
    console.log('  ✓ packages/CoreLib/dist/index.js');

    // 7. LINT workspace
    logStep(7, 'Linting consumer workspace (pnpm run lint)');
    execFileSync('pnpm', ['run', 'lint'], {
      cwd: wsDir,
      stdio: 'inherit',
    });
    console.log('✓ Lint passed with zero errors');

    // 8. FORMAT & FORMAT CHECK workspace
    logStep(8, 'Formatting and format-checking consumer workspace (pnpm run format && pnpm run format:check)');
    execFileSync('pnpm', ['run', 'format'], {
      cwd: wsDir,
      stdio: 'inherit',
    });
    execFileSync('pnpm', ['run', 'format:check'], {
      cwd: wsDir,
      stdio: 'inherit',
    });
    console.log('✓ Prettier formatting check passed with zero violations');

    // 9. RUN & HTTP REQUEST verification
    logStep(9, 'Running ApiHost server and verifying HTTP endpoints');
    const serverProcess = spawn(process.execPath, [path.join(wsDir, 'apps/ApiHost/dist/main.js')], {
      cwd: path.join(wsDir, 'apps/ApiHost'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let serverLogs = '';
    serverProcess.stdout.on('data', (d) => { serverLogs += d; });
    serverProcess.stderr.on('data', (d) => { serverLogs += d; });

    // Poll until server is listening
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await httpGet('http://127.0.0.1:3888/health');
        if (res.statusCode === 200) {
          serverReady = true;
          break;
        }
      } catch {
        // waiting
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!serverReady) {
      serverProcess.kill('SIGKILL');
      throw new Error(`Server failed to start on http://127.0.0.1:3888. Logs:\n${serverLogs}`);
    }

    console.log('✓ Server is active on http://127.0.0.1:3888');

    // Test GET /
    console.log('Testing GET http://127.0.0.1:3888/ ...');
    const rootRes = await httpGet('http://127.0.0.1:3888/');
    console.log(`  Status: ${rootRes.statusCode}`);
    console.log(`  Body: ${rootRes.body}`);
    const rootJson = JSON.parse(rootRes.body);
    if (rootRes.statusCode !== 200 || rootJson.message !== 'Welcome to Smoke Final API!') {
      throw new Error(`GET / failed: expected "Welcome to Smoke Final API!", got: ${rootRes.body}`);
    }
    console.log('  ✓ Verified greeting returned from referenced CoreLib!');

    // Test GET /health
    console.log('Testing GET http://127.0.0.1:3888/health ...');
    const healthRes = await httpGet('http://127.0.0.1:3888/health');
    console.log(`  Status: ${healthRes.statusCode}`);
    console.log(`  Body: ${healthRes.body}`);
    const healthJson = JSON.parse(healthRes.body);
    if (healthRes.statusCode !== 200 || healthJson.status !== 'ok') {
      throw new Error(`GET /health failed: expected status: "ok", got: ${healthRes.body}`);
    }
    console.log('  ✓ Verified health endpoint!');

    // Gracefully shutdown
    console.log('Terminating server with SIGTERM...');
    serverProcess.kill('SIGTERM');
    await new Promise((r) => serverProcess.on('exit', r));
    console.log('✓ Server shut down gracefully');

    logStep(10, 'CONSUMER SMOKE TEST PASSED 100%!');
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.rmSync(consumerDir, { recursive: true, force: true });
  }
}

runSmokeTest().catch((err) => {
  console.error('\n✖ SMOKE TEST FAILED:', err);
  process.exit(1);
});
