import { BuildService } from '@tsdk/build';
import { TsdkContext } from '../discovery.js';

export interface BuildCliArgs {
  rebuild?: boolean;
  verbose?: boolean;
}

export async function runBuild(context: TsdkContext, args: BuildCliArgs): Promise<number> {
  const startTime = Date.now();

  try {
    if (context.kind === 'workspace') {
      console.log(`[TSDK] Building workspace "${context.workspace.name}" (${context.workspace.projects.length} project(s))...`);
      const result = await BuildService.buildWorkspace(context.workspace, {
        rebuild: args.rebuild,
        verbose: args.verbose,
      });

      if (args.verbose && result.output) {
        console.log(result.output);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✔ Build succeeded in ${elapsed}s.`);
      return 0;
    } else {
      if (context.parentWorkspace) {
        console.log(`[TSDK] Building project "${context.project.name}" (in workspace "${context.parentWorkspace.name}")...`);
      } else {
        console.log(`[TSDK] Building standalone project "${context.project.name}"...`);
      }
      const result = await BuildService.buildProject(
        context.project,
        {
          rebuild: args.rebuild,
          verbose: args.verbose,
        },
        context.parentWorkspace,
      );

      if (args.verbose && result.output) {
        console.log(result.output);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✔ Build succeeded in ${elapsed}s.`);
      return 0;
    }
  } catch (err: unknown) {
    console.error(`\n✖ Build failed:`);
    if (err instanceof Error) {
      console.error(err.message);
    } else {
      console.error(String(err));
    }
    return 1;
  }
}
