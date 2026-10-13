import * as path from 'node:path';
import { TsdkContext } from '../discovery.js';

export function runProjectList(context: TsdkContext): number {
  if (context.kind === 'workspace') {
    const ws = context.workspace;
    console.log(`\nWorkspace: ${ws.name}`);
    console.log(`Location:  ${ws.filePath}\n`);
    console.log(`Registered Projects (${ws.projects.length}):`);
    console.log('--------------------------------------------------------------------------------');
    console.log(
      'NAME'.padEnd(20) +
        'TYPE'.padEnd(12) +
        'VERSION'.padEnd(10) +
        'PACKAGE'.padEnd(20) +
        'PATH',
    );
    console.log('--------------------------------------------------------------------------------');

    for (const proj of ws.projects) {
      const relPath = path.relative(ws.directory, proj.filePath);
      const pkg = proj.manifest.spec.package?.name ?? '-';
      console.log(
        proj.name.padEnd(20) +
          proj.type.padEnd(12) +
          proj.version.padEnd(10) +
          pkg.padEnd(20) +
          relPath,
      );
    }
    console.log('--------------------------------------------------------------------------------\n');
  } else {
    const proj = context.project;
    console.log(`\nProject:   ${proj.name}`);
    console.log(`Type:      ${proj.type}`);
    console.log(`Version:   ${proj.version}`);
    console.log(`Location:  ${proj.filePath}`);
    if (context.parentWorkspace) {
      console.log(`Workspace: ${context.parentWorkspace.name} (${context.parentWorkspace.filePath})`);
      console.log(`Tip: Run "tsdk project list --workspace" to see all projects in workspace.`);
    }
    console.log('');
  }

  return 0;
}
