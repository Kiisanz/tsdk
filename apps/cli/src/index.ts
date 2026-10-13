#!/usr/bin/env node
import { VERSION as CORE_VERSION } from '@tsnx/core';
import { runBuild } from './commands/build.js';
import { runClean } from './commands/clean.js';
import { runCreate } from './commands/create.js';
import { runGraph } from './commands/graph.js';
import { runProjectList } from './commands/project.js';
import { runRef } from './commands/ref.js';
import { runRestore } from './commands/restore.js';
import { runApp } from './commands/run.js';
import { runTestCommand } from './commands/test.js';
import { runWatchCommand } from './commands/watch.js';
import { runWorkspace } from './commands/workspace.js';
import { findContext } from './discovery.js';

function printHelp(): void {
  console.log(`
TSNX - TypeScript Application Framework CLI v${CORE_VERSION}

Usage:
  tsnx <command> [options]

Commands:
  create <template> <name>   Create a new project (templates: console, library, webapi)
  run [args...]              Build and run the project executable
  watch [args...]            Watch for changes, rebuild incrementally, and restart app
  test                       Run project tests using dependency graph
  build                      Build project or workspace based on dependency graph
  restore                    Synchronize project references into package.json (workspace:*)
  clean                      Clean build outputs (dist/) and build cache
  project list               List projects registered in workspace
  graph                      Visualize dependency relationships and build order
  ref add <target>           Add a project reference to current project
  workspace <subcommand>     Workspace commands (init, add)

Options:
  --workspace, -w            Operate on the entire workspace instead of current project
  --rebuild, -r              Force full recompilation
  --verbose, -v              Show verbose compiler output
  --help, -h                 Show this help message
  --version                  Show version
`);
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (rawArgs.includes('--version')) {
    console.log(`tsnx v${CORE_VERSION}`);
    process.exit(0);
  }

  const command = rawArgs[0];
  const subCommand = rawArgs[1];

  const forceWorkspace = rawArgs.includes('--workspace') || rawArgs.includes('-w');
  const rebuild = rawArgs.includes('--rebuild') || rawArgs.includes('-r') || rawArgs.includes('--force');
  const verbose = rawArgs.includes('--verbose') || rawArgs.includes('-v');

  // Discover context from cwd (prioritizing nearest .tsproj unless --workspace is passed)
  const context = findContext(process.cwd(), forceWorkspace);

  let exitCode = 0;

  switch (command) {
    case 'create':
      exitCode = runCreate(subCommand, rawArgs[2], context);
      break;

    case 'run': {
      if (!context) {
        console.error('[TSNX Error] No project (*.tsproj) found in current directory or parent directories.');
        process.exit(1);
      }
      // Pass remaining args after 'run'
      const appArgs = rawArgs.slice(1);
      exitCode = await runApp(context, appArgs);
      break;
    }

    case 'watch': {
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      const appArgs = rawArgs.slice(1);
      exitCode = await runWatchCommand(context, {
        runApp: context.kind === 'project',
        appArgs,
        forceWorkspace,
      });
      break;
    }

    case 'test': {
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      exitCode = await runTestCommand(context, { forceWorkspace });
      break;
    }

    case 'workspace':
      exitCode = runWorkspace(subCommand, rawArgs.slice(2), context);
      break;

    case 'ref':
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      exitCode = runRef(subCommand, rawArgs.slice(2), context);
      break;

    case 'build':
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      exitCode = await runBuild(context, { rebuild, verbose });
      break;

    case 'restore':
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      exitCode = await runRestore(context);
      break;

    case 'clean':
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      exitCode = await runClean(context);
      break;

    case 'project':
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      if (subCommand === 'list' || subCommand === 'ls' || !subCommand) {
        exitCode = runProjectList(context);
      } else {
        console.error(`[TSNX Error] Unknown sub-command "project ${subCommand}". Did you mean "tsnx project list"?`);
        exitCode = 1;
      }
      break;

    case 'graph':
      if (!context) {
        reportMissingContext(forceWorkspace);
      }
      exitCode = runGraph(context);
      break;

    default:
      console.error(`[TSNX Error] Unknown command: "${command}". Run "tsnx --help" for available commands.`);
      exitCode = 1;
  }

  process.exit(exitCode);
}

function reportMissingContext(forceWorkspace: boolean): never {
  if (forceWorkspace) {
    console.error('[TSNX Error] No workspace (*.tswork) found in current directory or parent directories.');
  } else {
    console.error('[TSNX Error] No project (*.tsproj) or workspace (*.tswork) found in current directory or parent directories.');
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('[TSNX Fatal Error]:', err);
  process.exit(1);
});
