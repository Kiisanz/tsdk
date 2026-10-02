import * as path from 'node:path';
import { DiagnosticFormatter, ProjectGraph, TsProject, TsWorkspace } from '@tsnx/core';
import { BuildOrchestrator } from '../orchestrator/build-orchestrator.js';
import { BuildOptions, BuildResult } from '../orchestrator/types.js';
import { PackageSyncManager } from '../package/package-sync.js';
import { PackageDriftItem, PackageSyncResult } from '../package/types.js';
import { ImportValidator } from '../validator/import-validator.js';
import { ImportDiagnostic } from '../validator/types.js';

function formatDiagnostics(diagnostics: ImportDiagnostic[]): string[] {
  return diagnostics.map((d) => {
    return DiagnosticFormatter.format({
      code: d.code,
      severity: 'error',
      file: path.relative(process.cwd(), d.filePath),
      line: d.line,
      column: d.column,
      message: d.message,
      suggestion: d.fixSuggestion,
    });
  });
}

export class ReferenceEnforcementError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: string[],
  ) {
    super(message);
    this.name = 'ReferenceEnforcementError';
  }
}

export class PackageDriftError extends Error {
  constructor(
    message: string,
    public readonly drifts: PackageDriftItem[],
  ) {
    super(message);
    this.name = 'PackageDriftError';
  }
}

export interface BuildServiceOptions extends BuildOptions {
  enforceReferences?: boolean;
}

export class BuildService {
  /**
   * Main build pipeline for a workspace:
   * 1. Resolve project graph
   * 2. Validate package consistency (.tsproj vs package.json)
   * 3. Enforce reference boundaries via AST scanner (TSDK2101, TSDK2102)
   * 4. Generate compiler configs in .tsdk/generated/
   * 5. Execute tsc --build
   */
  static async buildWorkspace(
    workspace: TsWorkspace,
    options: BuildServiceOptions = {},
  ): Promise<BuildResult> {
    const graph = ProjectGraph.fromWorkspace(workspace);

    if (!options.clean) {
      // 1. Reference Enforcement (M4)
      if (options.enforceReferences !== false) {
        const validation = ImportValidator.validateWorkspace(workspace);
        if (!validation.valid) {
          const formattedDiags = formatDiagnostics(validation.diagnostics);
          throw new ReferenceEnforcementError(
            `Reference enforcement failed with ${validation.diagnostics.length} diagnostic error(s):\n\n` +
              formattedDiags.join('\n\n'),
            formattedDiags,
          );
        }
      }

      // 2. Package consistency check
      const pkgValidation = PackageSyncManager.validateWorkspacePackages(workspace, graph);
      if (!pkgValidation.valid) {
        const details = pkgValidation.drifts.map((d) =>
          d.reason === 'missing'
            ? `[${d.project}] missing dependency "${d.packageName}: workspace:*"`
            : `[${d.project}] stale unreferenced dependency "${d.packageName}: workspace:*"`,
        );
        throw new PackageDriftError(
          `Package dependencies are out of sync with project manifests:\n  - ${details.join('\n  - ')}\n\nFix: Run "tsnx restore" to synchronize package.json.`,
          pkgValidation.drifts,
        );
      }
    }

    // 3. Build Orchestration (M1 & M2)
    return BuildOrchestrator.buildWorkspace(workspace, graph, options);
  }

  /**
   * Build pipeline for a project (standalone or within a parent workspace)
   */
  static async buildProject(
    project: TsProject,
    options: BuildServiceOptions = {},
    parentWorkspace?: TsWorkspace,
  ): Promise<BuildResult> {
    if (parentWorkspace) {
      const graph = ProjectGraph.fromWorkspace(parentWorkspace);

      if (options.enforceReferences !== false && !options.clean) {
        const diagnostics = ImportValidator.validateProject(project, parentWorkspace);
        if (diagnostics.length > 0) {
          const formattedDiags = formatDiagnostics(diagnostics);
          throw new ReferenceEnforcementError(
            `Reference enforcement failed with ${diagnostics.length} diagnostic error(s):\n\n` +
              formattedDiags.join('\n\n'),
            formattedDiags,
          );
        }
      }

      return BuildOrchestrator.buildProjectInWorkspace(parentWorkspace, project, graph, options);
    }

    const graph = ProjectGraph.fromProject(project);

    if (options.enforceReferences !== false && !options.clean) {
      const diagnostics = ImportValidator.validateProject(project);
      if (diagnostics.length > 0) {
        const formattedDiags = formatDiagnostics(diagnostics);
        throw new ReferenceEnforcementError(
          `Reference enforcement failed with ${diagnostics.length} diagnostic error(s):\n\n` +
            formattedDiags.join('\n\n'),
          formattedDiags,
        );
      }
    }

    return BuildOrchestrator.buildProject(project, graph, options);
  }

  /**
   * Restores and synchronizes declared project references into package.json
   */
  static restoreWorkspace(workspace: TsWorkspace): PackageSyncResult {
    const graph = ProjectGraph.fromWorkspace(workspace);
    return PackageSyncManager.syncWorkspacePackages(workspace, graph);
  }

  /**
   * Cleans workspace build artifacts
   */
  static async cleanWorkspace(workspace: TsWorkspace): Promise<BuildResult> {
    const graph = ProjectGraph.fromWorkspace(workspace);
    return BuildOrchestrator.cleanWorkspace(workspace, graph);
  }
}
