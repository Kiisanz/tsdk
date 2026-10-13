import * as fs from 'node:fs';
import * as path from 'node:path';
import { TsProject } from '../project/project.js';
import { TsWorkspace } from '../workspace/workspace.js';
import { CircularDependencyError, GraphNode, ReferenceResolutionError } from './types.js';

export class ProjectGraph {
  private readonly nodesMap = new Map<string, GraphNode>();

  constructor(projects: TsProject[], workspace?: TsWorkspace) {
    this.buildGraph(projects, workspace);
  }

  get nodes(): ReadonlyMap<string, GraphNode> {
    return this.nodesMap;
  }

  getNode(projectName: string): GraphNode | undefined {
    return this.nodesMap.get(projectName.trim().toLowerCase());
  }

  /**
   * Returns all projects topologically sorted so that dependencies appear before their dependents.
   */
  getBuildOrder(): TsProject[] {
    const inDegree = new Map<string, number>();
    for (const [key, node] of this.nodesMap) {
      inDegree.set(key, node.dependencies.length);
    }

    const queue: string[] = [];
    for (const [key, deg] of inDegree) {
      if (deg === 0) {
        queue.push(key);
      }
    }

    const order: TsProject[] = [];

    while (queue.length > 0) {
      // Deterministic sort on queue: alphabetical by project name
      queue.sort((a, b) => {
        const nameA = this.nodesMap.get(a)!.project.name;
        const nameB = this.nodesMap.get(b)!.project.name;
        return nameA.localeCompare(nameB);
      });

      const currentKey = queue.shift()!;
      const currentNode = this.nodesMap.get(currentKey)!;
      order.push(currentNode.project);

      for (const dependent of currentNode.dependents) {
        const depKey = dependent.name.toLowerCase();
        const currentDeg = inDegree.get(depKey)! - 1;
        inDegree.set(depKey, currentDeg);
        if (currentDeg === 0) {
          queue.push(depKey);
        }
      }
    }

    if (order.length !== this.nodesMap.size) {
      // If cycle wasn't caught in initial build, run DFS cycle finder
      this.detectAndThrowCycle();
    }

    return order;
  }

  getDependencies(projectName: string, recursive = false): TsProject[] {
    const node = this.getNode(projectName);
    if (!node) {
      throw new ReferenceResolutionError(`Project "${projectName}" not found in graph`);
    }

    if (!recursive) {
      return [...node.dependencies];
    }

    const result = new Set<TsProject>();
    const visited = new Set<string>();

    const traverse = (current: TsProject) => {
      const key = current.name.toLowerCase();
      if (visited.has(key)) return;
      visited.add(key);

      const currentNode = this.getNode(key);
      if (!currentNode) return;

      for (const dep of currentNode.dependencies) {
        result.add(dep);
        traverse(dep);
      }
    };

    traverse(node.project);
    return Array.from(result);
  }

  getDependents(projectName: string, recursive = false): TsProject[] {
    const node = this.getNode(projectName);
    if (!node) {
      throw new ReferenceResolutionError(`Project "${projectName}" not found in graph`);
    }

    if (!recursive) {
      return [...node.dependents];
    }

    const result = new Set<TsProject>();
    const visited = new Set<string>();

    const traverse = (current: TsProject) => {
      const key = current.name.toLowerCase();
      if (visited.has(key)) return;
      visited.add(key);

      const currentNode = this.getNode(key);
      if (!currentNode) return;

      for (const dep of currentNode.dependents) {
        result.add(dep);
        traverse(dep);
      }
    };

    traverse(node.project);
    return Array.from(result);
  }

  private buildGraph(projects: TsProject[], workspace?: TsWorkspace): void {
    // 1. Initialize node entries
    for (const project of projects) {
      const key = project.name.toLowerCase();
      if (this.nodesMap.has(key)) {
        const existing = this.nodesMap.get(key)!.project;
        throw new ReferenceResolutionError(
          `Duplicate project name "${project.name}" found in graph (${existing.filePath} and ${project.filePath})`,
          project.name,
        );
      }
      this.nodesMap.set(key, {
        project,
        dependencies: [],
        dependents: [],
      });
    }

    // 2. Resolve references
    for (const project of projects) {
      const sourceKey = project.name.toLowerCase();
      const sourceNode = this.nodesMap.get(sourceKey)!;

      for (const ref of project.references) {
        let targetProject: TsProject | undefined;

        if (workspace) {
          // In-workspace lookup by project name
          targetProject = workspace.getProject(ref.project);

          if (!targetProject) {
            throw new ReferenceResolutionError(
              `Referenced project "${ref.project}" was not found in workspace "${workspace.name}"`,
              project.name,
            );
          }

          // If path is specified inside workspace, it must match the registered project location
          if (ref.path) {
            const normalizedRef = ref.path.replace(/\\/g, '/');
            const expectedPath = path.resolve(project.directory, normalizedRef);
            const targetActualFile = path.resolve(targetProject.filePath);
            const targetActualDir = path.resolve(targetProject.directory);

            if (expectedPath !== targetActualFile && expectedPath !== targetActualDir) {
              throw new ReferenceResolutionError(
                `Reference path "${ref.path}" in project "${project.name}" does not match registered workspace location for "${ref.project}" (${targetProject.filePath})`,
                project.name,
              );
            }
          }
        } else {
          // Standalone project: path is mandatory
          if (!ref.path) {
            throw new ReferenceResolutionError(
              `Standalone reference to project "${ref.project}" must provide a "path" attribute`,
              project.name,
            );
          }

          const normalizedRef = ref.path.replace(/\\/g, '/');
          const targetResolvedPath = path.resolve(project.directory, normalizedRef);
          const targetFilePath = fs.existsSync(targetResolvedPath) && fs.statSync(targetResolvedPath).isDirectory()
            ? path.join(targetResolvedPath, `${ref.project}.tsproj`)
            : targetResolvedPath;

          if (!fs.existsSync(targetFilePath)) {
            throw new ReferenceResolutionError(
              `Referenced project file not found at path "${ref.path}" (resolved: "${targetFilePath}")`,
              project.name,
            );
          }

          const targetKey = ref.project.toLowerCase();
          const existingNode = this.nodesMap.get(targetKey);

          if (existingNode) {
            targetProject = existingNode.project;
          } else {
            targetProject = TsProject.loadSync(targetFilePath);
            this.nodesMap.set(targetKey, {
              project: targetProject,
              dependencies: [],
              dependents: [],
            });
          }
        }

        // Verify target manifest name matches the reference
        if (targetProject.name.toLowerCase() !== ref.project.toLowerCase()) {
          throw new ReferenceResolutionError(
            `Referenced project at "${ref.path ?? targetProject.filePath}" has name "${targetProject.name}", expected "${ref.project}"`,
            project.name,
          );
        }

        const targetNode = this.nodesMap.get(targetProject.name.toLowerCase())!;

        sourceNode.dependencies.push(targetProject);
        targetNode.dependents.push(project);
      }
    }

    // 3. Cycle Detection
    this.detectAndThrowCycle();
  }

  private detectAndThrowCycle(): void {
    enum VisitState {
      UNVISITED = 0,
      VISITING = 1,
      VISITED = 2,
    }

    const state = new Map<string, VisitState>();
    const parentMap = new Map<string, string | null>();

    for (const key of this.nodesMap.keys()) {
      state.set(key, VisitState.UNVISITED);
    }

    const dfs = (currentKey: string, stack: string[]): void => {
      state.set(currentKey, VisitState.VISITING);
      stack.push(currentKey);

      const node = this.nodesMap.get(currentKey)!;
      for (const dep of node.dependencies) {
        const depKey = dep.name.toLowerCase();
        const depState = state.get(depKey) ?? VisitState.UNVISITED;

        if (depState === VisitState.VISITING) {
          // Cycle found! Extract cycle path with original project names
          const cycleStartIndex = stack.indexOf(depKey);
          const cycleKeys = stack.slice(cycleStartIndex);
          cycleKeys.push(depKey);

          const cycleNames = cycleKeys.map((k) => this.nodesMap.get(k)!.project.name);
          throw new CircularDependencyError(cycleNames);
        }

        if (depState === VisitState.UNVISITED) {
          parentMap.set(depKey, currentKey);
          dfs(depKey, stack);
        }
      }

      stack.pop();
      state.set(currentKey, VisitState.VISITED);
    };

    for (const key of this.nodesMap.keys()) {
      if (state.get(key) === VisitState.UNVISITED) {
        dfs(key, []);
      }
    }
  }

  static fromWorkspace(workspace: TsWorkspace): ProjectGraph {
    return new ProjectGraph([...workspace.projects], workspace);
  }

  static fromProject(rootProject: TsProject): ProjectGraph {
    return new ProjectGraph([rootProject]);
  }
}
