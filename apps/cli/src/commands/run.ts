import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BuildService } from '@tsdk/build';
import { TsdkContext } from '../discovery.js';

export async function runApp(context: TsdkContext, appArgs: string[]): Promise<number> {
  if (context.kind !== 'project') {
    console.error(`[TSDK Error] "tsdk run" can only be executed within a project directory.`);
    console.error(`Navigate into a project directory (e.g., cd apps/MyApp) or use "tsdk build" for workspace.`);
    return 1;
  }

  const project = context.project;

  // 1. Auto-build project before running
  try {
    if (context.parentWorkspace) {
      console.log(`[TSDK] Building "${project.name}"...`);
    }
    await BuildService.buildProject(project, {}, context.parentWorkspace);
  } catch (err: unknown) {
    console.error(`\n✖ Build failed before running:`);
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }

  // 2. Resolve entry point in dist/
  const sourceRoot = project.manifest.spec.source?.root ?? 'src';
  const sourceEntry = project.manifest.spec.source?.entry ?? path.join(sourceRoot, 'main.ts');

  // Compute entry relative to source root
  const absSourceRoot = path.resolve(project.directory, sourceRoot);
  const absSourceEntry = path.resolve(project.directory, sourceEntry);
  const relFromRoot = path.relative(absSourceRoot, absSourceEntry);
  const relJs = relFromRoot.replace(/\.tsx?$/, '.js');

  let entryJsPath = path.resolve(project.directory, 'dist', relJs);

  if (!fs.existsSync(entryJsPath)) {
    // Fallback checks
    const fallbackMain = path.resolve(project.directory, 'dist', 'main.js');
    const fallbackIndex = path.resolve(project.directory, 'dist', 'index.js');
    if (fs.existsSync(fallbackMain)) {
      entryJsPath = fallbackMain;
    } else if (fs.existsSync(fallbackIndex)) {
      entryJsPath = fallbackIndex;
    } else {
      console.error(`[TSDK Error] Compiled entry file not found: "${entryJsPath}". Ensure project has an entry point.`);
      return 1;
    }
  }

  // 3. Execute application via node
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [entryJsPath, ...appArgs], {
      cwd: project.directory,
      stdio: 'inherit',
      env: { ...process.env },
    });

    const forwardSignal = (sig: NodeJS.Signals) => {
      if (!child.killed) {
        child.kill(sig);
      }
    };

    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    child.on('close', (code, sig) => {
      process.removeListener('SIGINT', forwardSignal);
      process.removeListener('SIGTERM', forwardSignal);
      resolve(code ?? (sig ? 0 : 0));
    });

    child.on('error', (err) => {
      process.removeListener('SIGINT', forwardSignal);
      process.removeListener('SIGTERM', forwardSignal);
      console.error(`[TSDK Error] Failed to launch application:`, err);
      resolve(1);
    });
  });
}
