import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BuildService } from '@tsnx/build';
import { TsProject, TsWorkspace } from '@tsnx/core';
import { TsdkContext } from '../discovery.js';

export interface OpenApiCliOptions {
  output: string;
  projectName?: string;
  url?: string;
  noBuild: boolean;
  pretty: boolean;
}

export function parseOpenApiArgs(rawArgs: string[]): OpenApiCliOptions {
  let output: string | undefined;
  let projectName: string | undefined;
  let url: string | undefined;
  let noBuild = false;
  let pretty = true;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--help' || arg === '-h') {
      // handled elsewhere
    } else if (arg === '--output' || arg === '-o') {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        output = rawArgs[i + 1];
        i++;
      }
    } else if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
    } else if (arg.startsWith('-o=')) {
      output = arg.slice('-o='.length);
    } else if (arg === '--project' || arg === '-p') {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        projectName = rawArgs[i + 1];
        i++;
      }
    } else if (arg.startsWith('--project=')) {
      projectName = arg.slice('--project='.length);
    } else if (arg.startsWith('-p=')) {
      projectName = arg.slice('-p='.length);
    } else if (arg === '--url' || arg === '-u') {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        url = rawArgs[i + 1];
        i++;
      }
    } else if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
    } else if (arg.startsWith('-u=')) {
      url = arg.slice('-u='.length);
    } else if (arg === '--no-build') {
      noBuild = true;
    } else if (arg === '--no-pretty') {
      pretty = false;
    } else if (!arg.startsWith('-') && !output) {
      output = arg;
    }
  }

  return {
    output: output ?? 'openapi.json',
    projectName,
    url,
    noBuild,
    pretty,
  };
}

export function printOpenApiHelp(): void {
  console.log(`
TSNX OpenAPI Tools

Usage:
  tsnx openapi <command> [options]

Commands:
  export [output]           Export OpenAPI 3.1 specification to a JSON file

Options:
  --output, -o <file>       Output file path (default: openapi.json)
  --project, -p <name>      Target project if running from a workspace
  --url, -u <url>           Fetch spec directly from a running application URL
  --no-build                Skip building the project before exporting
  --no-pretty               Output compact JSON without indentation
  --help, -h                Show this help message

Examples:
  tsnx openapi export
  tsnx openapi export ./dist/openapi.json
  tsnx openapi export --project Host -o ./openapi.json
  tsnx openapi export --url http://localhost:3000/openapi/v1.json -o ./openapi.json
`);
}

export async function runOpenApi(
  subCommand: string | undefined,
  rawArgs: string[],
  context: TsdkContext | null,
): Promise<number> {
  if (!subCommand || subCommand === '--help' || subCommand === '-h' || subCommand === 'help') {
    printOpenApiHelp();
    return 0;
  }

  if (subCommand !== 'export') {
    console.error(`[TSNX Error] Unknown openapi command: "${subCommand}". Run "tsnx openapi --help" for available commands.`);
    return 1;
  }

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printOpenApiHelp();
    return 0;
  }

  const options = parseOpenApiArgs(rawArgs);

  // 1. Fetch from live running server URL
  if (options.url) {
    try {
      console.log(`[TSNX OpenAPI] Fetching OpenAPI specification from ${options.url}...`);
      const response = await fetch(options.url);
      if (!response.ok) {
        console.error(`[TSNX Error] Failed to fetch OpenAPI from ${options.url}: HTTP ${response.status} ${response.statusText}`);
        return 1;
      }
      const doc = await response.json();
      const absOutput = path.resolve(process.cwd(), options.output);
      fs.mkdirSync(path.dirname(absOutput), { recursive: true });
      fs.writeFileSync(absOutput, JSON.stringify(doc, null, options.pretty ? 2 : 0), 'utf-8');
      console.log(`✔ Successfully exported OpenAPI specification to ${options.output}`);
      return 0;
    } catch (err: unknown) {
      console.error(
        `[TSNX Error] Failed to fetch OpenAPI from ${options.url}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 1;
    }
  }

  // 2. Build-time static export from project
  if (!context) {
    console.error('[TSNX Error] No project or workspace found in current directory or parent directories.');
    return 1;
  }

  let targetProject: TsProject;
  let parentWorkspace: TsWorkspace | undefined;

  if (context.kind === 'workspace') {
    parentWorkspace = context.workspace;

    if (options.projectName) {
      const found = context.workspace.projects.find(
        (p) => p.name.toLowerCase() === options.projectName!.toLowerCase(),
      );
      if (!found) {
        console.error(
          `[TSNX Error] Project "${options.projectName}" not found in workspace "${context.workspace.name}".`,
        );
        return 1;
      }
      targetProject = found;
    } else {
      const webapiProjects = context.workspace.projects.filter((p) => p.type === 'webapi');
      if (webapiProjects.length === 1) {
        targetProject = webapiProjects[0];
      } else {
        const runnableProjects = context.workspace.projects.filter((p) => p.type !== 'library');
        if (runnableProjects.length === 1) {
          targetProject = runnableProjects[0];
        } else if (runnableProjects.length === 0) {
          console.error(`[TSNX Error] No webapi or runnable projects found in workspace "${context.workspace.name}".`);
          return 1;
        } else {
          console.error(
            `[TSNX Error] Multiple runnable projects found in workspace "${context.workspace.name}". Specify a project using "--project <name>" or "-p <name>".`,
          );
          return 1;
        }
      }
    }
  } else {
    // context.kind === 'project'
    parentWorkspace = context.parentWorkspace;
    if (options.projectName && options.projectName.toLowerCase() !== context.project.name.toLowerCase()) {
      if (context.parentWorkspace) {
        const found = context.parentWorkspace.projects.find(
          (p) => p.name.toLowerCase() === options.projectName!.toLowerCase(),
        );
        if (found) {
          targetProject = found;
        } else {
          console.error(
            `[TSNX Error] Project "${options.projectName}" not found in workspace "${context.parentWorkspace.name}".`,
          );
          return 1;
        }
      } else {
        console.error(
          `[TSNX Error] Cannot switch to project "${options.projectName}": current directory is a standalone project without a parent workspace.`,
        );
        return 1;
      }
    } else {
      targetProject = context.project;
    }
  }

  // Build project if needed
  if (!options.noBuild) {
    try {
      console.log(`[TSNX] Building "${targetProject.name}" before exporting OpenAPI...`);
      await BuildService.buildProject(targetProject, {}, parentWorkspace);
    } catch (err: unknown) {
      console.error(`\n✖ Build failed before OpenAPI export:`);
      console.error(err instanceof Error ? err.message : err);
      return 1;
    }
  }

  // Resolve entry point
  const sourceRoot = targetProject.manifest.spec.source?.root ?? 'src';
  const sourceEntry = targetProject.manifest.spec.source?.entry ?? path.join(sourceRoot, 'main.ts');
  const absSourceRoot = path.resolve(targetProject.directory, sourceRoot);
  const absSourceEntry = path.resolve(targetProject.directory, sourceEntry);
  const relFromRoot = path.relative(absSourceRoot, absSourceEntry);
  const relJs = relFromRoot.replace(/\.tsx?$/, '.js');

  let entryJsPath = path.resolve(targetProject.directory, 'dist', relJs);
  if (!fs.existsSync(entryJsPath)) {
    const fallbackMain = path.resolve(targetProject.directory, 'dist', 'main.js');
    const fallbackIndex = path.resolve(targetProject.directory, 'dist', 'index.js');
    if (fs.existsSync(fallbackMain)) {
      entryJsPath = fallbackMain;
    } else if (fs.existsSync(fallbackIndex)) {
      entryJsPath = fallbackIndex;
    } else {
      console.error(`[TSNX Error] Compiled entry point not found for project "${targetProject.name}" at: ${entryJsPath}`);
      return 1;
    }
  }

  const targetOutput = path.resolve(process.cwd(), options.output);
  fs.mkdirSync(path.dirname(targetOutput), { recursive: true });

  console.log(`[TSNX OpenAPI] Introspecting endpoints from "${targetProject.name}"...`);

  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [entryJsPath], {
      cwd: targetProject.directory,
      env: {
        ...process.env,
        TSNX_OPENAPI_EXPORT: targetOutput,
        TSNX_OPENAPI_EXPORT_EXIT: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(targetOutput)) {
        try {
          const content = fs.readFileSync(targetOutput, 'utf-8');
          const parsed = JSON.parse(content);
          const pathCount = Object.keys(parsed.paths || {}).length;
          console.log(
            `✔ Successfully exported OpenAPI specification (${pathCount} path(s)) to ${options.output}`,
          );
          resolve(0);
        } catch {
          console.log(`✔ Successfully exported OpenAPI specification to ${options.output}`);
          resolve(0);
        }
      } else {
        console.error(`[TSNX Error] Failed to export OpenAPI specification (process exited with code ${code}):`);
        if (stderr.trim()) {
          console.error(stderr);
        } else if (stdout.trim()) {
          console.error(stdout);
        }
        resolve(1);
      }
    });

    child.on('error', (err) => {
      console.error(`[TSNX Error] Failed to spawn project process: ${err.message}`);
      resolve(1);
    });
  });
}
