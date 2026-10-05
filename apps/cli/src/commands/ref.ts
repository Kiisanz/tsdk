import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectGraph, parseJsonc, toKebabCase } from '@tsnx/core';
import { BuildService, PackageSyncManager } from '@tsnx/build';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { TsdkContext } from '../discovery.js';
import { PackageManagerDetector, installDependencies } from '../scaffolding/package-manager.js';

export async function runRef(
  subCommand: string | undefined,
  args: string[],
  context: TsdkContext | null,
): Promise<number> {
  if (!subCommand || subCommand === 'help' || subCommand === '--help' || subCommand === '-h' || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  tsnx ref <subcommand> <targetProject>

Subcommands:
  add <targetProject>       Add a project reference to current project (dual-wiring)
  remove <targetProject>    Remove a project reference and workspace dependency
  rm <targetProject>        Alias for remove

Examples:
  tsnx ref add Acme.Domain
  tsnx ref remove Acme.Domain
  tsnx ref rm @araserp/domain
`);
    return 0;
  }

  if (subCommand !== 'add' && subCommand !== 'remove' && subCommand !== 'rm') {
    console.error(`[TSNX Error] Unknown ref subcommand: "${subCommand}". Run "tsnx ref help".`);
    return 1;
  }

  const targetName = args[0];
  if (!targetName) {
    console.error(`[TSNX Error] Please specify target project: tsnx ref ${subCommand} <targetProject>`);
    return 1;
  }

  if (!context || context.kind !== 'project') {
    console.error(`[TSNX Error] "tsnx ref ${subCommand}" must be run inside a project directory.`);
    return 1;
  }

  const currentProject = context.project;
  const ws = context.parentWorkspace;

  if (targetName.toLowerCase() === currentProject.name.toLowerCase()) {
    console.error(`[TSNX Error] Cannot reference or dereference self ("${currentProject.name}").`);
    return 1;
  }

  let matchedTargetName = targetName;
  let targetProj = ws?.getProject(targetName);

  if (!targetProj && ws) {
    // Try resolving by package name
    targetProj = ws.projects.find(
      (p) =>
        p.manifest.spec.package?.name?.toLowerCase() === targetName.toLowerCase() ||
        p.manifest.spec.package?.name?.toLowerCase() === `@${targetName.replace(/^@/, '').toLowerCase()}`,
    );
  }

  if (targetProj) {
    matchedTargetName = targetProj.name;
  } else if (ws && subCommand === 'add') {
    console.error(`[TSNX Error] Referenced project "${targetName}" not found in workspace "${ws.name}".`);
    return 1;
  }

  const projDir = currentProject.directory;

  if (subCommand === 'add') {
    try {
      // 1. Dual-wiring: Update tsconfig.json references
      let relPath: string | undefined;
      if (targetProj) {
        relPath = path.relative(projDir, targetProj.directory).replace(/\\/g, '/');
        if (!relPath.startsWith('.')) {
          relPath = `./${relPath}`;
        }

        // 0. Validate target project has composite & declaration enabled for references
        const targetTsconfigPath = path.join(targetProj.directory, 'tsconfig.json');
        if (fs.existsSync(targetTsconfigPath)) {
          try {
            const raw = fs.readFileSync(targetTsconfigPath, 'utf-8');
            const parsed = parseJsonc(raw);
            if (!parsed.compilerOptions) parsed.compilerOptions = {};
            let tsconfigModified = false;
            if (!parsed.compilerOptions.composite) {
              parsed.compilerOptions.composite = true;
              tsconfigModified = true;
            }
            if (!parsed.compilerOptions.declaration) {
              parsed.compilerOptions.declaration = true;
              tsconfigModified = true;
            }
            if (tsconfigModified) {
              fs.writeFileSync(targetTsconfigPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
            }
          } catch {}
        }

        const tsconfigPath = path.join(projDir, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
          try {
            const raw = fs.readFileSync(tsconfigPath, 'utf-8');
            const parsed = parseJsonc(raw);
            if (!Array.isArray(parsed.references)) {
              parsed.references = [];
            }
            const alreadyInTsconfig = parsed.references.some(
              (r: any) => r && (r.path === relPath || r.path === relPath!.replace(/^\.\//, '')),
            );
            if (!alreadyInTsconfig) {
              parsed.references.push({ path: relPath });
              fs.writeFileSync(tsconfigPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
            }
          } catch {
            // Ignore tsconfig parse error
          }
        }

        // 2. Dual-wiring: Update package.json dependencies
        let targetPkgName = targetProj.manifest.spec.package?.name;
        if (!targetPkgName) {
          const targetPkgPath = path.join(targetProj.directory, 'package.json');
          if (fs.existsSync(targetPkgPath)) {
            try {
              const p = parseJsonc(fs.readFileSync(targetPkgPath, 'utf-8'));
              if (typeof p.name === 'string') {
                targetPkgName = p.name;
              }
            } catch {}
          }
        }
        if (!targetPkgName) {
          targetPkgName = toKebabCase(targetProj.name);
        }

        const pkgJsonPath = path.join(projDir, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
          try {
            const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
            const parsed = parseJsonc(raw);
            if (!parsed.dependencies || typeof parsed.dependencies !== 'object') {
              parsed.dependencies = {};
            }
            parsed.dependencies[targetPkgName] = 'workspace:*';
            fs.writeFileSync(pkgJsonPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
          } catch {
            // Ignore package.json parse error
          }
        }
      }

      // 3. Dual-wiring: Update .tsproj if present
      let tspFile: string | undefined;
      if (currentProject.filePath.endsWith('.tsproj') && fs.existsSync(currentProject.filePath)) {
        tspFile = currentProject.filePath;
      } else {
        const files = fs.readdirSync(projDir);
        const found = files.find((f) => f.endsWith('.tsproj'));
        if (found) {
          tspFile = path.join(projDir, found);
        }
      }

      if (tspFile && fs.existsSync(tspFile)) {
        const rawYaml = fs.readFileSync(tspFile, 'utf-8');
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

        if (!alreadyReferenced) {
          doc.spec.references.push({ project: matchedTargetName });
          fs.writeFileSync(tspFile, stringifyYaml(doc), 'utf-8');
        }
      }

      console.log(`✔ Added reference to "${matchedTargetName}" in "${currentProject.name}"`);

      // Synchronize package.json dependencies across workspace if workspace is available
      if (ws) {
        const updatedProjectClass = context.project.constructor as any;
        const reloadedProject = updatedProjectClass.loadSync(currentProject.filePath);
        const reloadedProjects = ws.projects.map((p) =>
          p.name.toLowerCase() === currentProject.name.toLowerCase() ? reloadedProject : p,
        );
        const updatedWs = new (ws.constructor as any)(ws.filePath, ws.manifest, reloadedProjects);
        const graph = ProjectGraph.fromWorkspace(updatedWs);

        PackageSyncManager.syncWorkspacePackages(updatedWs, graph);
        console.log(`✔ Synchronized package.json dependencies for "${currentProject.name}"`);

        const noInstall = args.includes('--no-install');
        if (!noInstall) {
          try {
            const pmRes = PackageManagerDetector.resolve({
              projectDir: ws.directory,
              contextWorkspaceDir: ws.directory,
            });
            installDependencies(pmRes.pm, pmRes.installDir);
            console.log(`✔ Linked workspace dependencies via ${pmRes.pm} install`);

            await BuildService.buildWorkspace(updatedWs);
            console.log(`✔ Built referenced project "${matchedTargetName}" (types ready)`);
          } catch (err: unknown) {
            console.warn(`ℹ Automatic relink/build skipped:`, err instanceof Error ? err.message : err);
          }
        }
      }

      return 0;
    } catch (err: unknown) {
      console.error(`✖ Failed to add reference:`, err instanceof Error ? err.message : err);
      return 1;
    }
  }

  // subCommand === 'remove' || subCommand === 'rm'
  try {
    let relPath: string | undefined;
    if (targetProj) {
      relPath = path.relative(projDir, targetProj.directory).replace(/\\/g, '/');
      if (!relPath.startsWith('.')) {
        relPath = `./${relPath}`;
      }
    }

    // 1. Dual-wiring: Remove from tsconfig.json references
    const tsconfigPath = path.join(projDir, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        const raw = fs.readFileSync(tsconfigPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.references)) {
          parsed.references = parsed.references.filter((r: any) => {
            if (!r || !r.path) return true;
            const norm = r.path.replace(/\\/g, '/');
            if (relPath && (norm === relPath || norm === relPath.replace(/^\.\//, ''))) {
              return false;
            }
            if (targetProj && norm.endsWith(`/${path.basename(targetProj.directory)}`)) {
              return false;
            }
            if (norm.endsWith(`/${matchedTargetName}`) || norm.endsWith(`/${toKebabCase(matchedTargetName)}`)) {
              return false;
            }
            return true;
          });
          fs.writeFileSync(tsconfigPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
        }
      } catch {
        // Non-critical
      }
    }

    // 2. Dual-wiring: Remove from package.json dependencies
    let targetPkgName = targetProj?.manifest.spec.package?.name;
    if (!targetPkgName && targetProj) {
      const targetPkgPath = path.join(targetProj.directory, 'package.json');
      if (fs.existsSync(targetPkgPath)) {
        try {
          const p = JSON.parse(fs.readFileSync(targetPkgPath, 'utf-8'));
          if (typeof p.name === 'string') {
            targetPkgName = p.name;
          }
        } catch {}
      }
    }
    if (!targetPkgName) {
      targetPkgName = toKebabCase(targetName);
    }
    const pkgJsonPath = path.join(projDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const toDelete = new Set([
          targetPkgName,
          targetName,
          matchedTargetName,
          toKebabCase(matchedTargetName),
        ]);

        if (parsed.dependencies && typeof parsed.dependencies === 'object') {
          for (const key of Object.keys(parsed.dependencies)) {
            if (toDelete.has(key)) {
              delete parsed.dependencies[key];
            }
          }
        }
        if (parsed.devDependencies && typeof parsed.devDependencies === 'object') {
          for (const key of Object.keys(parsed.devDependencies)) {
            if (toDelete.has(key)) {
              delete parsed.devDependencies[key];
            }
          }
        }
        fs.writeFileSync(pkgJsonPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
      } catch {
        // Non-critical
      }
    }

    // 3. Dual-wiring: Remove from .tsproj if present
    let tspFile: string | undefined;
    if (currentProject.filePath.endsWith('.tsproj') && fs.existsSync(currentProject.filePath)) {
      tspFile = currentProject.filePath;
    } else {
      const files = fs.readdirSync(projDir);
      const found = files.find((f) => f.endsWith('.tsproj'));
      if (found) {
        tspFile = path.join(projDir, found);
      }
    }

    if (tspFile && fs.existsSync(tspFile)) {
      const rawYaml = fs.readFileSync(tspFile, 'utf-8');
      const doc = parseYaml(rawYaml) as Record<string, any>;

      if (doc.spec && Array.isArray(doc.spec.references)) {
        doc.spec.references = doc.spec.references.filter(
          (r: any) =>
            !r ||
            !r.project ||
            (r.project.toLowerCase() !== matchedTargetName.toLowerCase() &&
              r.project.toLowerCase() !== targetName.toLowerCase()),
        );
        fs.writeFileSync(tspFile, stringifyYaml(doc), 'utf-8');
      }
    }

    console.log(`✔ Removed reference to "${matchedTargetName}" from "${currentProject.name}"`);

    // Synchronize workspace packages if workspace is available
    if (ws) {
      const updatedProjectClass = context.project.constructor as any;
      const reloadedProject = updatedProjectClass.loadSync(currentProject.filePath);
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
    console.error(`✖ Failed to remove reference:`, err instanceof Error ? err.message : err);
    return 1;
  }
}
