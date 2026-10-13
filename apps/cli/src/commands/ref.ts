import * as fs from 'node:fs';
import { ProjectGraph } from '@tsdk/core';
import { PackageSyncManager } from '@tsdk/build';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { TsdkContext } from '../discovery.js';

export function runRef(
  subCommand: string | undefined,
  args: string[],
  context: TsdkContext | null,
): number {
  if (!subCommand || subCommand === 'help') {
    console.log(`
Usage:
  tsdk ref add <targetProject>    Add a project reference to the current project

Examples:
  tsdk ref add Acme.Domain
`);
    return 0;
  }

  if (subCommand !== 'add') {
    console.error(`[TSDK Error] Unknown ref subcommand: "${subCommand}". Run "tsdk ref --help".`);
    return 1;
  }

  const targetName = args[0];
  if (!targetName) {
    console.error('[TSDK Error] Please specify target project: tsdk ref add <targetProject>');
    return 1;
  }

  if (!context || context.kind !== 'project') {
    console.error('[TSDK Error] "tsdk ref add" must be run inside a project directory.');
    return 1;
  }

  const currentProject = context.project;
  const ws = context.parentWorkspace;

  if (targetName.toLowerCase() === currentProject.name.toLowerCase()) {
    console.error(`[TSDK Error] Cannot reference self ("${currentProject.name}").`);
    return 1;
  }

  let matchedTargetName = targetName;
  if (ws) {
    const targetProj = ws.getProject(targetName);
    if (!targetProj) {
      console.error(`[TSDK Error] Referenced project "${targetName}" not found in workspace "${ws.name}".`);
      return 1;
    }
    matchedTargetName = targetProj.name;
  }

  // Read .tsproj and update references
  try {
    const rawYaml = fs.readFileSync(currentProject.filePath, 'utf-8');
    const doc = parseYaml(rawYaml) as Record<string, any>;

    if (!doc.spec || typeof doc.spec !== 'object') {
      doc.spec = {};
    }

    if (!Array.isArray(doc.spec.references)) {
      doc.spec.references = [];
    }

    const alreadyReferenced = doc.spec.references.some(
      (r: any) => r && r.project && r.project.toLowerCase() === matchedTargetName.toLowerCase(),
    );

    if (alreadyReferenced) {
      console.log(`[TSDK] Reference to "${matchedTargetName}" already exists in "${currentProject.name}".`);
      return 0;
    }

    doc.spec.references.push({ project: matchedTargetName });
    fs.writeFileSync(currentProject.filePath, stringifyYaml(doc), 'utf-8');

    console.log(`✔ Added reference to "${matchedTargetName}" in "${currentProject.name}.tsproj"`);

    // Synchronize package.json if workspace is available
    if (ws) {
      // Reload workspace with updated project manifest
      const updatedProject = context.project.constructor as any;
      const reloadedProject = updatedProject.loadSync(currentProject.filePath);
      const reloadedProjects = ws.projects.map((p) =>
        p.name.toLowerCase() === currentProject.name.toLowerCase() ? reloadedProject : p,
      );
      const updatedWs = new (ws.constructor as any)(ws.filePath, ws.manifest, reloadedProjects);
      const graph = ProjectGraph.fromWorkspace(updatedWs);

      PackageSyncManager.syncWorkspacePackages(updatedWs, graph);
      console.log(`✔ Synchronized package.json dependencies for "${currentProject.name}"`);
    }

    return 0;
  } catch (err: unknown) {
    console.error(`✖ Failed to add reference:`, err instanceof Error ? err.message : err);
    return 1;
  }
}
