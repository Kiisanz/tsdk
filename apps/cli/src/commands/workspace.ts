import { TsdkContext } from '../discovery.js';
import { WorkspaceManager } from '../scaffolding/workspace-manager.js';

export function runWorkspace(
  subCommand: string | undefined,
  args: string[],
  context: TsdkContext | null,
): number {
  if (!subCommand || subCommand === 'help') {
    console.log(`
Usage:
  tsdk workspace <subcommand> [args]

Subcommands:
  init <name>    Initialize a new .tswork workspace and pnpm-workspace.yaml
  add <path>     Register an existing project .tsproj into the nearest workspace
`);
    return 0;
  }

  if (subCommand === 'init') {
    const wsName = args[0];
    if (!wsName) {
      console.error('[TSNX Error] Please specify a workspace name: tsnx workspace init <name>');
      return 1;
    }

    try {
      const createdPath = WorkspaceManager.initWorkspace(wsName);
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
      console.error('[TSNX Error] No workspace (*.tswork) found in current or parent directories to add the project to.');
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

  console.error(`[TSNX Error] Unknown workspace subcommand: "${subCommand}". Run "tsnx workspace" for help.`);
  return 1;
}
