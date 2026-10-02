import { BuildService } from '@tsnx/build';
import { TsdkContext } from '../discovery.js';

export async function runRestore(context: TsdkContext): Promise<number> {
  const ws = context.kind === 'workspace' ? context.workspace : context.parentWorkspace;

  if (!ws) {
    console.log('[TSNX] Restore is only applicable to workspaces with project registries.');
    return 0;
  }

  console.log(`[TSNX] Restoring dependencies for workspace "${ws.name}"...`);

  const result = BuildService.restoreWorkspace(ws);

  if (result.updatedProjects.length > 0) {
    for (const proj of result.updatedProjects) {
      const deps = result.syncedDependencies[proj] || [];
      console.log(`  ✔ Updated ${proj} -> [${deps.join(', ')}]`);
    }
    console.log(`\n✔ Restore completed: ${result.updatedProjects.length} project(s) synchronized.`);
  } else {
    console.log(`\n✔ Workspace is already up to date.`);
  }

  return 0;
}
