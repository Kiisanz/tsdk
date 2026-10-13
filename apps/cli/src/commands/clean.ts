import { BuildService } from '@tsdk/build';
import { TsdkContext } from '../discovery.js';

export async function runClean(context: TsdkContext): Promise<number> {
  try {
    if (context.kind === 'workspace') {
      console.log(`[TSDK] Cleaning workspace "${context.workspace.name}"...`);
      await BuildService.cleanWorkspace(context.workspace);
    } else {
      console.log(`[TSDK] Cleaning project "${context.project.name}"...`);
      await BuildService.buildProject(context.project, { clean: true });
    }
    console.log(`✔ Clean completed.`);
    return 0;
  } catch (err: unknown) {
    console.error(`✖ Clean failed:`, err instanceof Error ? err.message : err);
    return 1;
  }
}
