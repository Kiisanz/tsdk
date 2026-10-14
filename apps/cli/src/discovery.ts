import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TsProject,
  TsWorkspace,
  isNativeProject,
  isNativeWorkspace,
} from '@tsnx/core';

export type TsdkContext =
  | { kind: 'workspace'; workspace: TsWorkspace; filePath: string }
  | { kind: 'project'; project: TsProject; filePath: string; parentWorkspace?: TsWorkspace };

export function findContext(startDir = process.cwd(), forceWorkspace = false): TsdkContext | null {
  let currentDir = path.resolve(startDir);

  // If path is a specific file directly
  if (fs.existsSync(currentDir) && fs.statSync(currentDir).isFile()) {
    if (currentDir.endsWith('.tswork')) {
      return {
        kind: 'workspace',
        workspace: TsWorkspace.loadSync(currentDir),
        filePath: currentDir,
      };
    }
    if (currentDir.endsWith('.tsproj')) {
      const parentWs = findParentWorkspace(path.dirname(currentDir));
      return {
        kind: 'project',
        project: TsProject.loadSync(currentDir),
        filePath: currentDir,
        parentWorkspace: parentWs ?? undefined,
      };
    }
    if (currentDir.endsWith('tsconfig.json')) {
      if (isNativeWorkspace(currentDir)) {
        return {
          kind: 'workspace',
          workspace: TsWorkspace.loadSync(currentDir),
          filePath: currentDir,
        };
      }
      if (isNativeProject(currentDir)) {
        const parentWs = findParentWorkspace(path.dirname(currentDir));
        return {
          kind: 'project',
          project: TsProject.loadSync(currentDir),
          filePath: currentDir,
          parentWorkspace: parentWs ?? undefined,
        };
      }
    }
    currentDir = path.dirname(currentDir);
  }

  // 1. If explicit --workspace requested, find nearest workspace upwards
  if (forceWorkspace) {
    let searchDir = currentDir;
    while (true) {
      try {
        const entries = fs.readdirSync(searchDir);
        const tswFile = entries.find((e) => e.endsWith('.tswork'));
        if (tswFile) {
          const fullPath = path.join(searchDir, tswFile);
          return {
            kind: 'workspace',
            workspace: TsWorkspace.loadSync(fullPath),
            filePath: fullPath,
          };
        }
        if (isNativeWorkspace(searchDir)) {
          const configPath = path.join(searchDir, 'tsconfig.json');
          return {
            kind: 'workspace',
            workspace: TsWorkspace.loadSync(searchDir),
            filePath: configPath,
          };
        }
      } catch {
        break;
      }
      const parentDir = path.dirname(searchDir);
      if (parentDir === searchDir) break;
      searchDir = parentDir;
    }
    return null;
  }

  // 2. Default behavior: Traverse upwards, prioritizing the nearest project
  let searchDir = currentDir;
  while (true) {
    try {
      const entries = fs.readdirSync(searchDir);

      // Check for .tsproj in current search directory first (nearest project)
      const tspFile = entries.find((e) => e.endsWith('.tsproj'));
      if (tspFile) {
        const fullTspPath = path.join(searchDir, tspFile);
        const parentWs = findParentWorkspace(path.dirname(searchDir));
        return {
          kind: 'project',
          project: TsProject.loadSync(fullTspPath),
          filePath: fullTspPath,
          parentWorkspace: parentWs ?? undefined,
        };
      }

      // Check for native project (has tsconfig.json and is NOT root workspace)
      if (isNativeProject(searchDir) && !isNativeWorkspace(searchDir)) {
        const configPath = path.join(searchDir, 'tsconfig.json');
        const parentWs = findParentWorkspace(path.dirname(searchDir));
        return {
          kind: 'project',
          project: TsProject.loadSync(searchDir),
          filePath: configPath,
          parentWorkspace: parentWs ?? undefined,
        };
      }

      // Check for .tswork if no project was found at this level (e.g. running from workspace root)
      const tswFile = entries.find((e) => e.endsWith('.tswork'));
      if (tswFile) {
        const fullTswPath = path.join(searchDir, tswFile);
        return {
          kind: 'workspace',
          workspace: TsWorkspace.loadSync(fullTswPath),
          filePath: fullTswPath,
        };
      }

      // Check for native workspace at this level
      if (isNativeWorkspace(searchDir)) {
        const configPath = path.join(searchDir, 'tsconfig.json');
        return {
          kind: 'workspace',
          workspace: TsWorkspace.loadSync(searchDir),
          filePath: configPath,
        };
      }
    } catch {
      break;
    }

    const parentDir = path.dirname(searchDir);
    if (parentDir === searchDir) break;
    searchDir = parentDir;
  }

  return null;
}

function findParentWorkspace(dir: string): TsWorkspace | null {
  let searchDir = dir;
  while (true) {
    try {
      const entries = fs.readdirSync(searchDir);
      const tswFile = entries.find((e) => e.endsWith('.tswork'));
      if (tswFile) {
        const fullPath = path.join(searchDir, tswFile);
        return TsWorkspace.loadSync(fullPath);
      }
      if (isNativeWorkspace(searchDir)) {
        return TsWorkspace.loadSync(searchDir);
      }
    } catch {
      break;
    }
    const parentDir = path.dirname(searchDir);
    if (parentDir === searchDir) break;
    searchDir = parentDir;
  }
  return null;
}
