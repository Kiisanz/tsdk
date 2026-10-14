import { TsdkContext } from '../discovery.js';
import {
  PackageManagerDetector,
  installDependencies,
} from '../scaffolding/package-manager.js';
import { TemplateGenerator, TemplateType } from '../scaffolding/template-generator.js';
import { WorkspaceManager } from '../scaffolding/workspace-manager.js';

export function runCreate(
  args: string[],
  context: TsdkContext | null,
): number {
  const positionalArgs: string[] = [];
  let explicitPm: string | undefined;
  const noInstall = args.includes('--no-install');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--package-manager' || arg === '-p') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        explicitPm = args[i + 1];
        i++;
      }
      continue;
    }
    if (arg.startsWith('--package-manager=')) {
      explicitPm = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('-')) {
      continue;
    }
    positionalArgs.push(arg);
  }

  const templateInput = positionalArgs[0];
  const nameInput = positionalArgs[1];

  if (!templateInput || !nameInput) {
    console.error(`
Usage:
  tsnx create <template> <name> [options]

Templates:
  console    Executable console application
  library    Reusable TypeScript library package
  webapi     HTTP Web API application powered by @tsnx/web

Options:
  --no-install               Skip automatic dependency installation
  --package-manager, -p <pm> Explicitly specify package manager (pnpm, npm, yarn, bun)

Examples:
  tsnx create console HelloWorld
  tsnx create library MyLib --no-install
  tsnx create webapi MyApi --package-manager pnpm
`);
    return 1;
  }

  const template = templateInput.toLowerCase();
  if (template !== 'console' && template !== 'library' && template !== 'webapi') {
    console.error(`[TSNX Error] Unknown template "${templateInput}". Supported templates: console, library, webapi.`);
    return 1;
  }

  const name = nameInput.trim();
  if (!name || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    console.error(`[TSNX Error] Invalid project name "${nameInput}". Must contain only alphanumeric characters, dots, dashes, or underscores.`);
    return 1;
  }

  const templateTitles: Record<TemplateType, string> = {
    console: 'Console',
    library: 'Library',
    webapi: 'Web API',
  };

  try {
    console.log(`Creating TSNX ${templateTitles[template as TemplateType]} project...\n`);

    const projectDir = TemplateGenerator.createProject({
      name,
      template: template as TemplateType,
    });

    console.log(`✓ Project scaffolded`);

    // If currently inside a workspace, automatically register the project
    const ws = context?.kind === 'workspace' ? context.workspace : context?.parentWorkspace;
    if (ws) {
      WorkspaceManager.addProjectToWorkspace(ws.filePath, projectDir);
      console.log(`✓ Registered project in workspace "${ws.name}"`);
    }

    // Resolve package manager and installation directory
    const resolution = PackageManagerDetector.resolve({
      explicitPm,
      projectDir,
      contextWorkspaceDir: ws?.directory,
    });
    const pm = resolution.pm;

    if (noInstall) {
      console.log(`○ Dependency installation skipped\n`);
      console.log(`Project created successfully!\n`);
      console.log(`Next steps:`);
      console.log(`  cd ${name}`);
      console.log(`  ${pm} install`);
      if (template === 'console' || template === 'webapi') {
        console.log(`  tsnx run`);
      } else {
        console.log(`  tsnx build`);
      }
      console.log('');
      return 0;
    }

    console.log(`✓ Package manager: ${pm}`);
    console.log(`✓ Installing dependencies`);

    try {
      installDependencies(pm, resolution.installDir);
      console.log(`✓ Dependencies installed\n`);
      console.log(`Project created successfully!\n`);
      console.log(`Next steps:`);
      console.log(`  cd ${name}`);
      if (template === 'console' || template === 'webapi') {
        console.log(`  tsnx run`);
      } else {
        console.log(`  tsnx build`);
      }
      console.log('');
      return 0;
    } catch (err: unknown) {
      console.error(`\n✖ Failed to install dependencies:`, err instanceof Error ? err.message : err);
      console.log(`\nNext steps:`);
      console.log(`  cd ${name}`);
      console.log(`  ${pm} install`);
      if (template === 'console' || template === 'webapi') {
        console.log(`  tsnx run`);
      } else {
        console.log(`  tsnx build`);
      }
      console.log('');
      return 1;
    }
  } catch (err: unknown) {
    console.error(`\n✖ Project creation failed:`, err instanceof Error ? err.message : err);
    return 1;
  }
}
