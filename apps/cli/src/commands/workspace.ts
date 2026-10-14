import { TsdkContext } from '../discovery.js';
import { WorkspaceManager } from '../scaffolding/workspace-manager.js';

export function runWorkspace(
  subCommand: string | undefined,
  args: string[],
  context: TsdkContext | null,
  isNativeInit = false,
): number {
  if (!subCommand || subCommand === 'help') {
    console.log(`
Usage:
  tsnx workspace <subcommand> [options]
  tsnx init workspace [options]

Subcommands:
  init [name]    Initialize a new native solution workspace with tsconfig.json & pnpm-workspace.yaml
  add <path>     Register an existing project into the nearest workspace

Options:
  -n, --name <name>    Workspace name
  --scope <scope>      Explicit npm package scope (e.g. @aras)
  --no-scope           Disable automatic package scope derivation
  --legacy             Initialize with legacy .tswork manifest only
`);
    return 0;
  }

  if (subCommand === 'init') {
    let explicitName: string | undefined;
    let explicitScope: string | undefined;
    let noScope = false;
    let legacy = false;
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '-n' || arg === '--name') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          explicitName = args[++i];
        }
        continue;
      }
      if (arg.startsWith('-n=')) {
        explicitName = arg.slice(3);
        continue;
      }
      if (arg.startsWith('--name=')) {
        explicitName = arg.slice(7);
        continue;
      }
      if (arg === '--scope') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          explicitScope = args[++i];
        }
        continue;
      }
      if (arg.startsWith('--scope=')) {
        explicitScope = arg.slice(8);
        continue;
      }
      if (arg === '--no-scope') {
        noScope = true;
        continue;
      }
      if (arg === '--legacy') {
        legacy = true;
        continue;
      }
      if (!arg.startsWith('-')) {
        positional.push(arg);
      }
    }

    const wsName = explicitName ?? positional[0];
    if (!wsName) {
      console.error('[TSNX Error] Please specify a workspace name: tsnx init workspace -n <name>');
      return 1;
    }

    const isLegacy =
      legacy || (!isNativeInit && !explicitName && !explicitScope && !noScope && !args.includes('--native'));

    try {
      const createdPath = WorkspaceManager.initWorkspace({
        name: wsName,
        scope: explicitScope,
        noScope,
        legacy: isLegacy,
      });
      console.log(`\n✔ Initialized workspace "${wsName}" at ${createdPath}`);
      return 0;
    } catch (err: unknown) {
      console.error(`\n✖ Workspace init failed:`, err instanceof Error ? err.message : err);
      return 1;
    }
  }

  if (subCommand === 'add') {
    const projectPath = args[0];
    if (!projectPath) {
      console.error('[TSNX Error] Please specify a project path: tsnx workspace add <projectPath>');
      return 1;
    }

    const ws = context?.kind === 'workspace' ? context.workspace : context?.parentWorkspace;
    if (!ws) {
      console.error('[TSNX Error] No workspace found in current or parent directories to add the project to.');
      return 1;
    }

    try {
      const addedRel = WorkspaceManager.addProjectToWorkspace(ws.filePath, projectPath);
      console.log(`✔ Registered project "${projectPath}" in workspace "${ws.name}" (${addedRel})`);
      return 0;
    } catch (err: unknown) {
      console.error(`\n✖ Failed to add project to workspace:`, err instanceof Error ? err.message : err);
      return 1;
    }
  }

  console.error(`[TSNX Error] Unknown workspace subcommand: "${subCommand}". Run "tsnx workspace help".`);
  return 1;
}
