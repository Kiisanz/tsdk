import * as fs from 'node:fs';
import * as path from 'node:path';
import { derivePackageScope, parseJsonc, toKebabCase, TsWorkspace, validateNpmScope } from '@tsnx/core';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface InitWorkspaceOptions {
  name: string;
  scope?: string;
  noScope?: boolean;
  targetDir?: string;
}

export class WorkspaceManager {
  static initWorkspace(nameOrOptions: string | InitWorkspaceOptions, optionalTargetDir = process.cwd()): string {
    const opts: InitWorkspaceOptions =
      typeof nameOrOptions === 'string'
        ? { name: nameOrOptions, targetDir: optionalTargetDir }
        : nameOrOptions;

    const name = opts.name.trim();
    if (!name) {
      throw new Error('Workspace name cannot be empty.');
    }

    const targetDir = path.resolve(opts.targetDir ?? process.cwd());
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Native Workspace (tsconfig.json + package.json + pnpm-workspace.yaml)
    const tsconfigPath = path.join(targetDir, 'tsconfig.json');
    const pkgJsonPath = path.join(targetDir, 'package.json');

    // Determine package scope
    let scope: string | undefined;
    if (opts.noScope) {
      scope = undefined;
    } else if (opts.scope) {
      if (!validateNpmScope(opts.scope)) {
        throw new Error(
          `Invalid npm package scope "${opts.scope}". Must start with "@" followed by lowercase alphanumeric/hyphen characters.`,
        );
      }
      scope = opts.scope;
    } else {
      scope = derivePackageScope(name);
    }

    // 1. Root package.json
    let pkgJson: Record<string, any> = {};
    if (fs.existsSync(pkgJsonPath)) {
      try {
        pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      } catch {
        pkgJson = {};
      }
    }
    pkgJson.name = pkgJson.name ?? toKebabCase(name);
    pkgJson.private = true;
    pkgJson.workspaces = pkgJson.workspaces ?? ['*', '*/*'];
    pkgJson.devDependencies = {
      '@types/node': '^22.13.9',
      typescript: '^5.7.3',
      ...(pkgJson.devDependencies ?? {}),
    };
    pkgJson.tsnx = {
      name,
      ...(scope ? { scope } : {}),
    };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');

    // 2. Solution-style root tsconfig.json (Project References)
    let tsconfig: Record<string, any> = {
      files: [],
      references: [],
    };
    if (fs.existsSync(tsconfigPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
        tsconfig = {
          ...existing,
          files: existing.files ?? [],
          references: existing.references ?? [],
        };
      } catch {
        // Fall back to default
      }
    }
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');

    // 3. Create pnpm-workspace.yaml if not present
    const pnpmWsPath = path.join(targetDir, 'pnpm-workspace.yaml');
    if (!fs.existsSync(pnpmWsPath)) {
      const pnpmWsContent = `packages:
  - '*'
  - '*/*'
`;
      fs.writeFileSync(pnpmWsPath, pnpmWsContent, 'utf-8');
    }

    return tsconfigPath;
  }

  static addProjectToWorkspace(workspacePathOrDir: string, projectPathOrDir: string): string {
    let wsDir = path.resolve(workspacePathOrDir);
    if (fs.existsSync(wsDir) && fs.statSync(wsDir).isFile()) {
      wsDir = path.dirname(wsDir);
    }

    let projDir = path.resolve(projectPathOrDir);
    if (fs.existsSync(projDir) && fs.statSync(projDir).isFile()) {
      projDir = path.dirname(projDir);
    }

    if (!fs.existsSync(projDir)) {
      throw new Error(`Project directory "${projDir}" does not exist.`);
    }

    const relDir = path.relative(wsDir, projDir).replace(/\\/g, '/');
    const normalizedRefPath = relDir.startsWith('.') ? relDir : `./${relDir}`;

    // 1. Update root tsconfig.json if it exists (Project References)
    const rootTsconfigPath = path.join(wsDir, 'tsconfig.json');
    if (fs.existsSync(rootTsconfigPath)) {
      try {
        const raw = fs.readFileSync(rootTsconfigPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.references)) {
          parsed.references = [];
        }
        const exists = parsed.references.some(
          (r: any) => r && r.path && (r.path === normalizedRefPath || r.path === relDir),
        );
        if (!exists) {
          parsed.references.push({ path: normalizedRefPath });
          fs.writeFileSync(rootTsconfigPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
        }
      } catch {
        // Non-critical if tsconfig is malformed
      }
    }

    // 2. Update *.tswork if present
    let tswFile: string | undefined;
    if (workspacePathOrDir.endsWith('.tswork') && fs.existsSync(workspacePathOrDir)) {
      tswFile = workspacePathOrDir;
    } else {
      const files = fs.readdirSync(wsDir);
      const found = files.find((f) => f.endsWith('.tswork'));
      if (found) {
        tswFile = path.join(wsDir, found);
      }
    }

    if (tswFile && fs.existsSync(tswFile)) {
      let tswEntryPath = relDir;
      try {
        const projFiles = fs.readdirSync(projDir);
        const tsp = projFiles.find((f) => f.endsWith('.tsproj'));
        if (tsp) {
          tswEntryPath = path.join(relDir, tsp).replace(/\\/g, '/');
        }
      } catch {}

      const content = fs.readFileSync(tswFile, 'utf-8');
      const doc = parseYaml(content) as Record<string, any>;
      if (!doc.projects || !Array.isArray(doc.projects)) {
        doc.projects = [];
      }

      const exists = doc.projects.some(
        (p: any) =>
          p.path &&
          (p.path.replace(/\\/g, '/') === tswEntryPath || p.path.replace(/\\/g, '/') === relDir),
      );

      if (!exists) {
        doc.projects.push({ path: tswEntryPath });
        fs.writeFileSync(tswFile, stringifyYaml(doc), 'utf-8');
      }
    }

    return normalizedRefPath;
  }

  static removeProjectFromWorkspace(
    workspacePathOrDir: string,
    projectNameOrPath: string,
    options: { deleteFiles?: boolean } = {},
  ): {
    removedProjectName: string;
    removedPath: string;
    cleanedReferencesFrom: string[];
    deletedFiles: boolean;
  } {
    let wsDir = path.resolve(workspacePathOrDir);
    if (fs.existsSync(wsDir) && fs.statSync(wsDir).isFile()) {
      wsDir = path.dirname(wsDir);
    }

    const ws = TsWorkspace.loadSync(wsDir);
    const targetQuery = projectNameOrPath.trim();
    const targetQueryLower = targetQuery.toLowerCase();

    // 1. Locate project in workspace
    let matchedProj = ws.projects.find(
      (p) =>
        p.name.toLowerCase() === targetQueryLower ||
        (p.manifest.spec.package?.name && p.manifest.spec.package.name.toLowerCase() === targetQueryLower),
    );

    if (!matchedProj) {
      // Try resolving by directory name or path
      matchedProj = ws.projects.find((p) => {
        const rel = path.relative(wsDir, p.directory).replace(/\\/g, '/');
        return (
          rel.toLowerCase() === targetQueryLower ||
          rel.toLowerCase() === `./${targetQueryLower}` ||
          path.basename(p.directory).toLowerCase() === targetQueryLower
        );
      });
    }

    const targetProjName = matchedProj ? matchedProj.name : targetQuery;
    const targetProjDir = matchedProj
      ? matchedProj.directory
      : path.resolve(wsDir, targetQuery);
    const targetPkgName = matchedProj?.manifest.spec.package?.name;

    const relProjDir = path.relative(wsDir, targetProjDir).replace(/\\/g, '/');
    const normalizedRefPath = relProjDir.startsWith('.') ? relProjDir : `./${relProjDir}`;

    // 2. Remove from root tsconfig.json
    const rootTsconfigPath = path.join(wsDir, 'tsconfig.json');
    if (fs.existsSync(rootTsconfigPath)) {
      try {
        const raw = fs.readFileSync(rootTsconfigPath, 'utf-8');
        const parsed = parseJsonc(raw);
        if (Array.isArray(parsed.references)) {
          parsed.references = parsed.references.filter((r: any) => {
            if (!r || !r.path) return true;
            const norm = r.path.replace(/\\/g, '/');
            return norm !== normalizedRefPath && norm !== relProjDir && norm !== targetQuery;
          });
          fs.writeFileSync(rootTsconfigPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
        }
      } catch {
        // Ignore JSON error
      }
    }

    // 3. Remove from .tswork if present
    const tswFiles = fs.readdirSync(wsDir).filter((f) => f.endsWith('.tswork'));
    for (const tswFile of tswFiles) {
      const fullTswPath = path.join(wsDir, tswFile);
      try {
        const content = fs.readFileSync(fullTswPath, 'utf-8');
        const doc = parseYaml(content) as Record<string, any>;
        if (Array.isArray(doc.projects)) {
          doc.projects = doc.projects.filter((p: any) => {
            if (!p || !p.path) return true;
            const norm = p.path.replace(/\\/g, '/');
            return (
              !norm.includes(relProjDir) &&
              !norm.includes(targetQuery) &&
              norm !== targetProjName
            );
          });
          fs.writeFileSync(fullTswPath, stringifyYaml(doc), 'utf-8');
        }
      } catch {
        // Ignore YAML error
      }
    }

    // 4. Remove references and dependencies from other projects in workspace
    const cleanedReferencesFrom: string[] = [];
    for (const otherProj of ws.projects) {
      if (otherProj.directory === targetProjDir) continue;

      let modified = false;

      // Clean other project tsconfig.json references
      const otherTsconfigPath = path.join(otherProj.directory, 'tsconfig.json');
      if (fs.existsSync(otherTsconfigPath)) {
        try {
          const raw = fs.readFileSync(otherTsconfigPath, 'utf-8');
          const parsed = parseJsonc(raw);
          if (Array.isArray(parsed.references)) {
            const initialLen = parsed.references.length;
            parsed.references = parsed.references.filter((r: any) => {
              if (!r || !r.path) return true;
              const absRefTarget = path.resolve(otherProj.directory, r.path);
              return absRefTarget !== targetProjDir;
            });
            if (parsed.references.length !== initialLen) {
              fs.writeFileSync(otherTsconfigPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
              modified = true;
            }
          }
        } catch {}
      }

      // Clean other project package.json dependencies
      const otherPkgPath = path.join(otherProj.directory, 'package.json');
      if (fs.existsSync(otherPkgPath)) {
        try {
          const raw = fs.readFileSync(otherPkgPath, 'utf-8');
          const pkg = parseJsonc(raw);
          let pkgModified = false;
          if (targetPkgName) {
            if (pkg.dependencies && pkg.dependencies[targetPkgName]) {
              delete pkg.dependencies[targetPkgName];
              pkgModified = true;
            }
            if (pkg.devDependencies && pkg.devDependencies[targetPkgName]) {
              delete pkg.devDependencies[targetPkgName];
              pkgModified = true;
            }
          }
          if (pkgModified) {
            fs.writeFileSync(otherPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
            modified = true;
          }
        } catch {}
      }

      if (modified) {
        cleanedReferencesFrom.push(otherProj.name);
      }
    }

    // 5. Optionally delete files from disk
    let deletedFiles = false;
    if (options.deleteFiles && fs.existsSync(targetProjDir)) {
      fs.rmSync(targetProjDir, { recursive: true, force: true });
      deletedFiles = true;
    }

    return {
      removedProjectName: targetProjName,
      removedPath: normalizedRefPath,
      cleanedReferencesFrom,
      deletedFiles,
    };
  }
}
