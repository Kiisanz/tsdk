import * as fs from 'node:fs';
import * as path from 'node:path';
import { TsProject } from '../project/project.js';
import { loadNativeProjectSync, isNativeProject } from '../project/native.js';
import { TsWorkspace } from './workspace.js';
import { TsWorkspaceManifest, WorkspaceProjectEntry } from './types.js';
import { parseJsonc } from '../utils/jsonc.js';

export function isNativeWorkspace(dirOrFile: string): boolean {
  try {
    const stat = fs.statSync(dirOrFile);
    const dir = stat.isDirectory() ? dirOrFile : path.dirname(dirOrFile);
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    const packageJsonPath = path.join(dir, 'package.json');

    if (!fs.existsSync(tsconfigPath) || !fs.existsSync(packageJsonPath)) {
      return false;
    }

    // If a .tswork manifest is present, it is a legacy workspace
    const files = fs.readdirSync(dir);
    if (files.some((f) => f.endsWith('.tswork'))) {
      return false;
    }

    const rawPkg = fs.readFileSync(packageJsonPath, 'utf8');
    const pkg = parseJsonc(rawPkg);

    // If it has an explicit project type, it is a project, not a workspace
    if (pkg.tsnx?.type) {
      return false;
    }

    const rawTsConfig = fs.readFileSync(tsconfigPath, 'utf8');
    const parsed = parseJsonc(rawTsConfig);

    // Solution tsconfig must have references array and usually no composite: true
    if (Array.isArray(parsed.references)) {
      const pnpmWs = path.join(dir, 'pnpm-workspace.yaml');
      const hasWorkspacesField = Array.isArray(pkg.workspaces) || typeof pkg.workspaces === 'object';
      return fs.existsSync(pnpmWs) || hasWorkspacesField || !parsed.compilerOptions?.composite;
    }
    return false;
  } catch {
    return false;
  }
}

export function loadNativeWorkspaceSync(dirOrFile: string): TsWorkspace {
  const stat = fs.statSync(dirOrFile);
  const dir = stat.isDirectory() ? dirOrFile : path.dirname(dirOrFile);
  const tsconfigPath = path.join(dir, 'tsconfig.json');
  const packageJsonPath = path.join(dir, 'package.json');

  const rawPkg = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = parseJsonc(rawPkg);

  let tsconfig: Record<string, any> = { files: [], references: [] };
  if (fs.existsSync(tsconfigPath)) {
    const rawTs = fs.readFileSync(tsconfigPath, 'utf8');
    tsconfig = parseJsonc(rawTs);
  }

  const workspaceName: string =
    pkg.tsnx?.name ?? pkg.name ?? path.basename(dir);
  const workspaceScope: string | undefined = pkg.tsnx?.scope;

  const references: Array<{ path: string }> = Array.isArray(tsconfig.references)
    ? tsconfig.references
    : [];

  const loadedProjects: TsProject[] = [];
  const projectEntries: WorkspaceProjectEntry[] = [];

  for (const ref of references) {
    const targetDir = path.resolve(dir, ref.path);
    try {
      if (isNativeProject(targetDir)) {
        const proj = loadNativeProjectSync(targetDir);
        loadedProjects.push(proj);
        projectEntries.push({ path: ref.path });
      } else {
        const proj = TsProject.loadSync(targetDir);
        loadedProjects.push(proj);
        projectEntries.push({ path: ref.path });
      }
    } catch {
      // Skip invalid / unresolvable reference targets
    }
  }

  const manifest: TsWorkspaceManifest = {
    schemaVersion: 1,
    kind: 'Workspace',
    metadata: {
      name: workspaceName,
      scope: workspaceScope,
    },
    projects: projectEntries,
    defaults: pkg.tsnx?.defaults,
  };

  return new TsWorkspace(tsconfigPath, manifest, loadedProjects);
}
