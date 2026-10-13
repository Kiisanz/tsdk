import * as path from 'node:path';
import { TsdkContext } from '../discovery.js';

export function runProjectList(context: TsdkContext): number {
  if (context.kind === 'workspace') {
    const ws = context.workspace;
    console.log(`\nWorkspace: ${ws.name}`);
    console.log(`Location:  ${ws.filePath}\n`);
    console.log(`Registered Projects (${ws.projects.length}):`);
    const nameWidth = Math.max(16, ...ws.projects.map((p) => p.name.length + 2));
    const typeWidth = Math.max(10, ...ws.projects.map((p) => p.type.length + 2));
    const versionWidth = Math.max(9, ...ws.projects.map((p) => p.version.length + 2));
    const pkgWidth = Math.max(18, ...ws.projects.map((p) => (p.manifest.spec.package?.name ?? '-').length + 2));

    const termCols = process.stdout?.columns || 80;
    const totalWidth = nameWidth + typeWidth + versionWidth + pkgWidth + 20;
    const separator = '-'.repeat(Math.max(60, Math.min(totalWidth, termCols)));

    console.log(separator);
    console.log(
      'NAME'.padEnd(nameWidth) +
        'TYPE'.padEnd(typeWidth) +
        'VERSION'.padEnd(versionWidth) +
        'PACKAGE'.padEnd(pkgWidth) +
        'PATH',
    );
    console.log(separator);

    for (const proj of ws.projects) {
      const relPath = path.relative(ws.directory, proj.filePath);
      const pkg = proj.manifest.spec.package?.name ?? '-';
      console.log(
        proj.name.padEnd(nameWidth) +
          proj.type.padEnd(typeWidth) +
          proj.version.padEnd(versionWidth) +
          pkg.padEnd(pkgWidth) +
          relPath,
      );
    }
    console.log(separator + '\n');
  } else {
    const proj = context.project;
    console.log(`\nProject:   ${proj.name}`);
    console.log(`Type:      ${proj.type}`);
    console.log(`Version:   ${proj.version}`);
    console.log(`Location:  ${proj.filePath}`);
    if (context.parentWorkspace) {
      console.log(`Workspace: ${context.parentWorkspace.name} (${context.parentWorkspace.filePath})`);
      console.log(`Tip: Run "tsnx project list --workspace" to see all projects in workspace.`);
    }
    console.log('');
  }

  return 0;
}
