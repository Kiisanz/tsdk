import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BuildService } from '@tsnx/build';
import { TsProject, TsWorkspace } from '@tsnx/core';
import { TsdkContext } from '../discovery.js';

export interface RunOptions {
  projectName?: string;
  noBuild: boolean;
  appArgs: string[];
}

export function parseRunArgs(rawArgs: string[]): RunOptions {
  let projectName: string | undefined;
  let noBuild = false;
  const appArgs: string[] = [];

  const dashDashIdx = rawArgs.indexOf('--');
  const cliArgs = dashDashIdx !== -1 ? rawArgs.slice(0, dashDashIdx) : rawArgs;
  const forwardedAfterDash = dashDashIdx !== -1 ? rawArgs.slice(dashDashIdx + 1) : [];

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i];
    if (arg === '--no-build') {
      noBuild = true;
      continue;
    }
    if (arg === '--project' || arg === '-p') {
      if (i + 1 < cliArgs.length && !cliArgs[i + 1].startsWith('-')) {
        projectName = cliArgs[i + 1];
        i++;
      }
      continue;
    }
    if (arg.startsWith('--project=')) {
      projectName = arg.slice('--project='.length);
      continue;
    }
    if (arg.startsWith('-p=')) {
      projectName = arg.slice('-p='.length);
      continue;
    }
    appArgs.push(arg);
  }

  return {
    projectName,
    noBuild,
    appArgs: [...appArgs, ...forwardedAfterDash],
  };
}

export async function runApp(context: TsdkContext, rawRunArgs: string[]): Promise<number> {
  const { projectName, noBuild, appArgs } = parseRunArgs(rawRunArgs);

  let targetProject: TsProject;
  let parentWorkspace: TsWorkspace | undefined;

  if (context.kind === 'workspace') {
    parentWorkspace = context.workspace;

    if (projectName) {
      const found = context.workspace.projects.find(
        (p) => p.name.toLowerCase() === projectName.toLowerCase(),
      );
      if (!found) {
        console.error(`[TSNX Error] Project "${projectName}" not found in workspace "${context.workspace.name}".`);
        if (context.workspace.projects.length > 0) {
          console.error(`\nAvailable projects:`);
          for (const p of context.workspace.projects) {
            console.error(`  - ${p.name} (${p.type})`);
          }
        }
        return 1;
      }
      targetProject = found;
    } else {
      // Auto-detect runnable project if not specified
      const runnableProjects = context.workspace.projects.filter((p) => p.type !== 'library');
      if (runnableProjects.length === 1) {
        targetProject = runnableProjects[0];
      } else if (runnableProjects.length === 0) {
        console.error(`[TSNX Error] No runnable projects found in workspace "${context.workspace.name}".`);
        return 1;
      } else {
        console.error(
          `[TSNX Error] Multiple runnable projects found in workspace "${context.workspace.name}". Specify a project using "--project <name>" or "-p <name>".`,
        );
        console.error(`\nAvailable projects:`);
        for (const p of runnableProjects) {
          console.error(`  - ${p.name} (${p.type})`);
        }
        return 1;
      }
    }
  } else {
    // context.kind === 'project'
    parentWorkspace = context.parentWorkspace;

    if (projectName && projectName.toLowerCase() !== context.project.name.toLowerCase()) {
      if (context.parentWorkspace) {
        const found = context.parentWorkspace.projects.find(
          (p) => p.name.toLowerCase() === projectName.toLowerCase(),
        );
        if (found) {
          targetProject = found;
        } else {
          console.error(
            `[TSNX Error] Project "${projectName}" not found in workspace "${context.parentWorkspace.name}".`,
          );
          return 1;
        }
      } else {
        console.error(
          `[TSNX Error] Cannot switch to project "${projectName}": current directory is a standalone project without a parent workspace.`,
        );
        return 1;
      }
    } else {
      targetProject = context.project;
    }
  }

  // 1. Auto-build project before running (unless --no-build is specified)
  if (!noBuild) {
    try {
      if (parentWorkspace) {
        console.log(`[TSNX] Building "${targetProject.name}" (in workspace "${parentWorkspace.name}")...`);
      } else {
        console.log(`[TSNX] Building "${targetProject.name}"...`);
      }
      await BuildService.buildProject(targetProject, {}, parentWorkspace);
    } catch (err: unknown) {
      console.error(`\n✖ Build failed before running:`);
      console.error(err instanceof Error ? err.message : err);
      return 1;
    }
  }

  // 2. Resolve entry point in dist/
  const sourceRoot = targetProject.manifest.spec.source?.root ?? 'src';
  const sourceEntry = targetProject.manifest.spec.source?.entry ?? path.join(sourceRoot, 'main.ts');

  // Compute entry relative to source root
  const absSourceRoot = path.resolve(targetProject.directory, sourceRoot);
  const absSourceEntry = path.resolve(targetProject.directory, sourceEntry);
  const relFromRoot = path.relative(absSourceRoot, absSourceEntry);
  const relJs = relFromRoot.replace(/\.tsx?$/, '.js');

  let entryJsPath = path.resolve(targetProject.directory, 'dist', relJs);

  if (!fs.existsSync(entryJsPath)) {
    // Fallback checks
    const fallbackMain = path.resolve(targetProject.directory, 'dist', 'main.js');
    const fallbackIndex = path.resolve(targetProject.directory, 'dist', 'index.js');
    if (fs.existsSync(fallbackMain)) {
      entryJsPath = fallbackMain;
    } else if (fs.existsSync(fallbackIndex)) {
      entryJsPath = fallbackIndex;
    } else {
      if (noBuild) {
        console.error(
          `[TSNX Error] Compiled entry file not found: "${entryJsPath}". Did you build the project? Run without "--no-build" or execute "tsnx build".`,
        );
      } else {
        console.error(
          `[TSNX Error] Compiled entry file not found: "${entryJsPath}". Ensure project has an entry point.`,
        );
      }
      return 1;
    }
  }

  // 3. Execute application via node
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [entryJsPath, ...appArgs], {
      cwd: targetProject.directory,
      stdio: 'inherit',
      env: { ...process.env },
    });

    let hasExited = false;

    const forwardSignal = (sig: NodeJS.Signals) => {
      if (!hasExited && child.exitCode === null && child.signalCode === null) {
        try {
          child.kill(sig);
        } catch {
          // child might have already terminated
        }
      }
    };

    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    child.on('exit', () => {
      hasExited = true;
    });

    child.on('close', (code, sig) => {
      hasExited = true;
      process.removeListener('SIGINT', forwardSignal);
      process.removeListener('SIGTERM', forwardSignal);
      if (code !== null) {
        resolve(code);
      } else if (sig) {
        const signalNum = (os.constants.signals as Record<string, number>)[sig] ?? 1;
        resolve(128 + signalNum);
      } else {
        resolve(1);
      }
    });

    child.on('error', (err) => {
      hasExited = true;
      process.removeListener('SIGINT', forwardSignal);
      process.removeListener('SIGTERM', forwardSignal);
      console.error(`[TSNX Error] Failed to launch application:`, err);
      resolve(1);
    });
  });
}
