import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectReference, ProjectType, TsProjectManifest } from './types.js';
import { TsProject } from './project.js';
import { parseJsonc } from '../utils/jsonc.js';

export function isNativeProject(dirOrFile: string): boolean {
  try {
    const stat = fs.statSync(dirOrFile);
    const dir = stat.isDirectory() ? dirOrFile : path.dirname(dirOrFile);
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    const packageJsonPath = path.join(dir, 'package.json');

    if (!fs.existsSync(tsconfigPath) || !fs.existsSync(packageJsonPath)) {
      return false;
    }

    // If a .tsproj manifest is present, it is a legacy project
    const files = fs.readdirSync(dir);
    if (files.some((f) => f.endsWith('.tsproj'))) {
      return false;
    }

    const rawTsConfig = fs.readFileSync(tsconfigPath, 'utf8');
    const parsed = parseJsonc(rawTsConfig);
    return parsed.compilerOptions?.composite === true || Array.isArray(parsed.include);
  } catch {
    return false;
  }
}

export function loadNativeProjectSync(dirOrFile: string): TsProject {
  const stat = fs.statSync(dirOrFile);
  const dir = stat.isDirectory() ? dirOrFile : path.dirname(dirOrFile);
  const tsconfigPath = path.join(dir, 'tsconfig.json');
  const packageJsonPath = path.join(dir, 'package.json');

  const rawPkg = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = parseJsonc(rawPkg);

  let tsconfig: Record<string, unknown> = {};
  if (fs.existsSync(tsconfigPath)) {
    const rawTs = fs.readFileSync(tsconfigPath, 'utf8');
    tsconfig = parseJsonc(rawTs);
  }

  const projectName: string = pkg.tsnx?.name ?? pkg.name ?? path.basename(dir);
  const projectType: ProjectType =
    pkg.tsnx?.type ??
    (fs.existsSync(path.join(dir, 'src', 'main.ts')) ? 'console' : 'library');

  const compilerOpts = (tsconfig.compilerOptions as Record<string, unknown>) ?? {};
  const rawReferences = (tsconfig.references as Array<{ path: string }>) ?? [];

  const references: ProjectReference[] = rawReferences.map((ref) => {
    const targetDir = path.resolve(dir, ref.path);
    let targetProjectName = path.basename(targetDir);

    const targetPkgPath = path.join(targetDir, 'package.json');
    if (fs.existsSync(targetPkgPath)) {
      try {
        const targetPkg = parseJsonc(fs.readFileSync(targetPkgPath, 'utf8'));
        targetProjectName = targetPkg.tsnx?.name ?? targetPkg.name ?? targetProjectName;
      } catch {
        // Fallback to directory name
      }
    }

    return {
      project: targetProjectName,
      path: ref.path,
    };
  });

  const manifest: TsProjectManifest = {
    schemaVersion: 1,
    kind: 'Project',
    metadata: {
      name: projectName,
      version: pkg.version ?? '0.1.0',
    },
    spec: {
      type: projectType,
      runtime: pkg.tsnx?.runtime ?? 'node',
      package: {
        name: pkg.name,
        private: pkg.private ?? false,
      },
      source: {
        root: (compilerOpts.rootDir as string) ?? 'src',
        entry: fs.existsSync(path.join(dir, 'src', 'main.ts')) ? 'main.ts' : 'index.ts',
      },
      compiler: compilerOpts,
      references,
    },
  };

  return new TsProject(tsconfigPath, manifest);
}
