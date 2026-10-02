import * as fs from 'node:fs';
import * as path from 'node:path';
import { TsProject } from '../project/project.js';
import { parseWorkspaceYaml, WorkspaceValidationError } from './parser.js';
import { TsWorkspaceManifest, WorkspaceDefaults } from './types.js';
import { isNativeWorkspace, loadNativeWorkspaceSync } from './native.js';

export class TsWorkspace {
  public readonly filePath: string;
  public readonly directory: string;
  public readonly manifest: TsWorkspaceManifest;
  private readonly projectRegistry = new Map<string, TsProject>();

  constructor(filePath: string, manifest: TsWorkspaceManifest, projects: TsProject[] = []) {
    this.filePath = path.resolve(filePath);
    this.directory = path.dirname(this.filePath);
    this.manifest = manifest;

    for (const project of projects) {
      this.registerProject(project);
    }
  }

  get name(): string {
    return this.manifest.metadata.name;
  }

  get scope(): string | undefined {
    return this.manifest.metadata.scope;
  }

  get defaults(): WorkspaceDefaults | undefined {
    return this.manifest.defaults;
  }

  get projects(): readonly TsProject[] {
    return Array.from(this.projectRegistry.values());
  }

  getProject(name: string): TsProject | undefined {
    return this.projectRegistry.get(name.trim().toLowerCase());
  }

  hasProject(name: string): boolean {
    return this.projectRegistry.has(name.trim().toLowerCase());
  }

  private registerProject(project: TsProject): void {
    const key = project.name.toLowerCase();
    if (this.projectRegistry.has(key)) {
      const existing = this.projectRegistry.get(key)!;
      throw new WorkspaceValidationError(
        `Duplicate project name "${project.name}" in workspace. Projects "${existing.filePath}" and "${project.filePath}" share the same name (case-insensitive).`,
        this.filePath,
      );
    }
    this.projectRegistry.set(key, project);
  }

  static loadSync(filePath: string): TsWorkspace {
    const resolvedPath = path.resolve(filePath);
    if (isNativeWorkspace(resolvedPath)) {
      return loadNativeWorkspaceSync(resolvedPath);
    }
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const manifest = parseWorkspaceYaml(content, resolvedPath);
    const workspaceDir = path.dirname(resolvedPath);

    const loadedProjects: TsProject[] = [];

    for (const projectEntry of manifest.projects) {
      const normalizedEntryPath = projectEntry.path.replace(/\\/g, '/');
      const projectAbsPath = path.resolve(workspaceDir, normalizedEntryPath);
      if (!fs.existsSync(projectAbsPath)) {
        throw new WorkspaceValidationError(
          `Referenced project file not found: "${projectEntry.path}" (resolved: "${projectAbsPath}")`,
          resolvedPath,
        );
      }

      const project = TsProject.loadSync(projectAbsPath);
      applyWorkspaceDefaults(project, manifest.defaults);
      loadedProjects.push(project);
    }

    return new TsWorkspace(resolvedPath, manifest, loadedProjects);
  }

  static async load(filePath: string): Promise<TsWorkspace> {
    const resolvedPath = path.resolve(filePath);
    const content = await fs.promises.readFile(resolvedPath, 'utf-8');
    const manifest = parseWorkspaceYaml(content, resolvedPath);
    const workspaceDir = path.dirname(resolvedPath);

    const loadedProjects: TsProject[] = [];

    for (const projectEntry of manifest.projects) {
      const normalizedEntryPath = projectEntry.path.replace(/\\/g, '/');
      const projectAbsPath = path.resolve(workspaceDir, normalizedEntryPath);
      try {
        await fs.promises.access(projectAbsPath);
      } catch {
        throw new WorkspaceValidationError(
          `Referenced project file not found: "${projectEntry.path}" (resolved: "${projectAbsPath}")`,
          resolvedPath,
        );
      }

      const project = await TsProject.load(projectAbsPath);
      applyWorkspaceDefaults(project, manifest.defaults);
      loadedProjects.push(project);
    }

    return new TsWorkspace(resolvedPath, manifest, loadedProjects);
  }
}

function applyWorkspaceDefaults(project: TsProject, defaults?: WorkspaceDefaults): void {
  if (!defaults) return;

  // Runtime inheritance
  if (defaults.runtime && !project.manifest.spec.runtime) {
    project.manifest.spec.runtime = defaults.runtime;
  }

  // Compiler inheritance (project values take precedence)
  if (defaults.compiler) {
    project.manifest.spec.compiler = {
      ...defaults.compiler,
      ...(project.manifest.spec.compiler ?? {}),
    };
  }
}
