import * as fs from 'node:fs';
import * as path from 'node:path';
import { TsProject, TsWorkspace } from '@tsnx/core';

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
      } catch {
        break;
      }
      const parentDir = path.dirname(searchDir);
      if (parentDir === searchDir) break;
      searchDir = parentDir;
    }
    return null;
  }

  // 2. Default behavior: Traverse upwards, prioritizing the nearest .tsproj project
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

      // Check for .tswork if no .tsproj was found at this level (e.g. running from workspace root)
      const tswFile = entries.find((e) => e.endsWith('.tswork'));
      if (tswFile) {
        const fullTswPath = path.join(searchDir, tswFile);
        return {
          kind: 'workspace',
          workspace: TsWorkspace.loadSync(fullTswPath),
          filePath: fullTswPath,
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
    } catch {
      break;
    }
    const parentDir = path.dirname(searchDir);
    if (parentDir === searchDir) break;
    searchDir = parentDir;
  }
  return null;
}
