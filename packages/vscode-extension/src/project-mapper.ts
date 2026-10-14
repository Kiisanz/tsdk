import * as fs from 'node:fs';
import * as path from 'node:path';
import { TsWorkspace, TsProject } from '@tsnx/core';

export interface ProjectMapping {
  name: string;
  directory: string;
  sourceRoot: string;
  configPath: string;
  compilerOptions: Record<string, unknown>;
  references: string[];
}

export interface WorkspaceMapping {
  workspaceRoot: string;
  projects: ProjectMapping[];
}

export class ProjectMapper {
  /**
   * Reads workspace and project manifests and extracts compiler configurations.
   */
  static getWorkspaceMapping(rootPath: string): WorkspaceMapping | undefined {
    if (!fs.existsSync(rootPath)) return undefined;

    const entries = fs.readdirSync(rootPath);
    const tsworkFile = entries.find((e) => e.endsWith('.tswork'));

    if (tsworkFile) {
      return this.fromWorkspace(rootPath, path.join(rootPath, tsworkFile));
    }

    const tsprojFile = entries.find((e) => e.endsWith('.tsproj'));
    if (tsprojFile) {
      return this.fromStandalone(rootPath, path.join(rootPath, tsprojFile));
    }

    return undefined;
  }

  private static fromWorkspace(rootPath: string, tsworkPath: string): WorkspaceMapping {
    const workspace = TsWorkspace.loadSync(tsworkPath);
    const generatedDir = path.join(rootPath, '.tsnx', 'generated');

    const projects: ProjectMapping[] = workspace.projects.map((proj: TsProject) => {
      const sourceRootRel = proj.manifest.spec.source?.root ?? 'src';
      const sourceRoot = path.resolve(proj.directory, sourceRootRel);
      const configPath = path.join(generatedDir, `${proj.name}.tsconfig.json`);

      let compilerOptions: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          const parsed = JSON.parse(raw);
          compilerOptions = parsed.compilerOptions ?? {};
        } catch {
          // Fallback if parsing fails
        }
      }

      const references = (proj.manifest.spec.references ?? []).map((r) => r.project);

      return {
        name: proj.name,
        directory: proj.directory,
        sourceRoot,
        configPath,
        compilerOptions,
        references,
      };
    });

    return {
      workspaceRoot: rootPath,
      projects,
    };
  }

  private static fromStandalone(rootPath: string, tsprojPath: string): WorkspaceMapping {
    const proj = TsProject.loadSync(tsprojPath);
    const sourceRootRel = proj.manifest.spec.source?.root ?? 'src';
    const sourceRoot = path.resolve(proj.directory, sourceRootRel);
    const configPath = path.join(rootPath, '.tsnx', 'generated', 'tsconfig.json');

    let compilerOptions: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        compilerOptions = parsed.compilerOptions ?? {};
      } catch {
        // Fallback
      }
    }

    return {
      workspaceRoot: rootPath,
      projects: [
        {
          name: proj.name,
          directory: proj.directory,
          sourceRoot,
          configPath,
          compilerOptions,
          references: [],
        },
      ],
    };
  }

  /**
   * Determines which project in the mapping owns the given file path.
   */
  static findProjectForFile(
    mapping: WorkspaceMapping,
    filePath: string,
  ): ProjectMapping | undefined {
    const normalizedFile = path.resolve(filePath).replace(/\\/g, '/');

    // Find the project whose sourceRoot is a prefix of the file path
    for (const project of mapping.projects) {
      const normalizedSourceRoot = project.sourceRoot.replace(/\\/g, '/');
      if (
        normalizedFile === normalizedSourceRoot ||
        normalizedFile.startsWith(normalizedSourceRoot + '/')
      ) {
        return project;
      }
    }

    // Fallback: check if file is within project directory
    for (const project of mapping.projects) {
      const normalizedProjDir = project.directory.replace(/\\/g, '/');
      if (
        normalizedFile === normalizedProjDir ||
        normalizedFile.startsWith(normalizedProjDir + '/')
      ) {
        return project;
      }
    }

    return undefined;
  }
}
