import { BuildService } from '@tsnx/build';
import { TsdkContext } from '../discovery.js';

export async function runClean(context: TsdkContext): Promise<number> {
  try {
    if (context.kind === 'workspace') {
      console.log(`[TSNX] Cleaning workspace "${context.workspace.name}"...`);
      await BuildService.cleanWorkspace(context.workspace);
    } else {
      console.log(`[TSNX] Cleaning project "${context.project.name}"...`);
      await BuildService.buildProject(context.project, { clean: true });
    }
    console.log(`✔ Clean completed.`);
    return 0;
  } catch (err: unknown) {
    console.error(`✖ Clean failed:`, err instanceof Error ? err.message : err);
    return 1;
  }
}
