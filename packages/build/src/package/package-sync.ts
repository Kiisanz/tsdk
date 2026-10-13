import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectGraph, TsWorkspace } from '@tsdk/core';
import {
  MissingPackageDependency,
  PackageDriftItem,
  PackageSyncResult,
  PackageValidationResult,
} from './types.js';

export class PackageSyncManager {
  /**
   * Synchronizes declared project references to each project's package.json
   * as `workspace:*` dependencies. Idempotent.
   * Also prunes obsolete `workspace:*` references no longer declared in .tsproj.
   */
  static syncWorkspacePackages(
    workspace: TsWorkspace,
    graph: ProjectGraph,
  ): PackageSyncResult {
    const updatedProjects: string[] = [];
    const unchangedProjects: string[] = [];
    const syncedDependencies: Record<string, string[]> = {};

    // Collect all package names produced by projects in the workspace
    const allWorkspacePackageNames = new Set<string>();
    for (const p of workspace.projects) {
      const name = p.manifest.spec.package?.name;
      if (name) {
        allWorkspacePackageNames.add(name);
      }
    }

    for (const project of workspace.projects) {
      const node = graph.getNode(project.name);
      const dependencies = node ? node.dependencies : [];

      const requiredLocalPackages: string[] = [];
      for (const dep of dependencies) {
        const pkgName = dep.manifest.spec.package?.name;
        if (pkgName) {
          requiredLocalPackages.push(pkgName);
        }
      }

      syncedDependencies[project.name] = requiredLocalPackages;

      const pkgJsonPath = path.join(project.directory, 'package.json');
      let pkgJson: Record<string, any> = {};
      let changed = false;

      if (fs.existsSync(pkgJsonPath)) {
        try {
          pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        } catch {
          pkgJson = {};
        }
      } else {
        pkgJson = {
          name: project.manifest.spec.package?.name ?? project.name.toLowerCase(),
          version: project.version,
          type: 'module',
        };
        changed = true;
      }

      if (!pkgJson.dependencies || typeof pkgJson.dependencies !== 'object') {
        pkgJson.dependencies = {};
        changed = true;
      }

      // 1. Add missing required local packages
      for (const localPkg of requiredLocalPackages) {
        if (pkgJson.dependencies[localPkg] !== 'workspace:*') {
          pkgJson.dependencies[localPkg] = 'workspace:*';
          changed = true;
        }
      }

      // 2. Prune obsolete workspace dependencies no longer declared in .tsproj
      for (const depKey of Object.keys(pkgJson.dependencies)) {
        if (
          pkgJson.dependencies[depKey] === 'workspace:*' &&
          allWorkspacePackageNames.has(depKey) &&
          !requiredLocalPackages.includes(depKey)
        ) {
          delete pkgJson.dependencies[depKey];
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
        updatedProjects.push(project.name);
      } else {
        unchangedProjects.push(project.name);
      }
    }

    return {
      updatedProjects,
      unchangedProjects,
      syncedDependencies,
    };
  }

  /**
   * Validates that all required local project references are present in package.json
   * and that no unreferenced workspace dependencies exist.
   */
  static validateWorkspacePackages(
    workspace: TsWorkspace,
    graph: ProjectGraph,
  ): PackageValidationResult {
    const missingDependencies: MissingPackageDependency[] = [];
    const drifts: PackageDriftItem[] = [];

    // Collect all package names produced by projects in the workspace
    const allWorkspacePackageNames = new Set<string>();
    for (const p of workspace.projects) {
      const name = p.manifest.spec.package?.name;
      if (name) {
        allWorkspacePackageNames.add(name);
      }
    }

    for (const project of workspace.projects) {
      const node = graph.getNode(project.name);
      const dependencies = node ? node.dependencies : [];
      const pkgJsonPath = path.join(project.directory, 'package.json');

      let currentDeps: Record<string, string> = {};
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          currentDeps = parsed.dependencies ?? {};
        } catch {
          currentDeps = {};
        }
      }

      const requiredLocalPackages = new Set<string>();
      for (const dep of dependencies) {
        const pkgName = dep.manifest.spec.package?.name;
        if (!pkgName) continue;
        requiredLocalPackages.add(pkgName);

        if (currentDeps[pkgName] !== 'workspace:*') {
          missingDependencies.push({
            project: project.name,
            packageJsonPath: pkgJsonPath,
            expectedPackage: pkgName,
          });
          drifts.push({
            project: project.name,
            packageJsonPath: pkgJsonPath,
            packageName: pkgName,
            reason: 'missing',
          });
        }
      }

      // Detect obsolete/stale workspace dependencies
      for (const depKey of Object.keys(currentDeps)) {
        if (
          currentDeps[depKey] === 'workspace:*' &&
          allWorkspacePackageNames.has(depKey) &&
          !requiredLocalPackages.has(depKey)
        ) {
          drifts.push({
            project: project.name,
            packageJsonPath: pkgJsonPath,
            packageName: depKey,
            reason: 'stale',
          });
        }
      }
    }

    return {
      valid: drifts.length === 0,
      drifts,
      missingDependencies,
    };
  }
}
