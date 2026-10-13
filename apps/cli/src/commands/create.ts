import { TsdkContext } from '../discovery.js';
import { TemplateGenerator, TemplateType } from '../scaffolding/template-generator.js';
import { WorkspaceManager } from '../scaffolding/workspace-manager.js';

export function runCreate(
  templateInput: string | undefined,
  nameInput: string | undefined,
  context: TsdkContext | null,
): number {
  if (!templateInput || !nameInput) {
    console.error(`
Usage:
  tsdk create <template> <name>

Templates:
  console    Executable console application
  library    Reusable TypeScript library package
  webapi     HTTP Web API application powered by @tsdk/web

Examples:
  tsdk create console HelloWorld
  tsdk create library MyLib
  tsdk create webapi MyApi
`);
    return 1;
  }

  const template = templateInput.toLowerCase();
  if (template !== 'console' && template !== 'library' && template !== 'webapi') {
    console.error(`[TSDK Error] Unknown template "${templateInput}". Supported templates: console, library, webapi.`);
    return 1;
  }

  const name = nameInput.trim();
  if (!name || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    console.error(`[TSDK Error] Invalid project name "${nameInput}". Must contain only alphanumeric characters, dots, dashes, or underscores.`);
    return 1;
  }

  try {
    const projectDir = TemplateGenerator.createProject({
      name,
      template: template as TemplateType,
    });

    console.log(`\n✔ Created ${template} project "${name}" in ${projectDir}`);

    // If currently inside a workspace, automatically register the project
    const ws = context?.kind === 'workspace' ? context.workspace : context?.parentWorkspace;
    if (ws) {
      const addedRel = WorkspaceManager.addProjectToWorkspace(ws.filePath, projectDir);
      console.log(`✔ Registered project in workspace "${ws.name}" (${addedRel})`);
    }

    console.log(`\nNext steps:`);
    console.log(`  cd ${name}`);
    if (template === 'console' || template === 'webapi') {
      console.log(`  tsdk run`);
    } else {
      console.log(`  tsdk build`);
    }
    console.log('');
    return 0;
  } catch (err: unknown) {
    console.error(`\n✖ Project creation failed:`, err instanceof Error ? err.message : err);
    return 1;
  }
}
