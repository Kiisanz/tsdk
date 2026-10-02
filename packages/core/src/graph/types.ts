import { TsProject } from '../project/project.js';

export interface GraphNode {
  project: TsProject;
  dependencies: TsProject[];
  dependents: TsProject[];
}

export class ReferenceResolutionError extends Error {
  constructor(message: string, public readonly sourceProject?: string) {
    super(sourceProject ? `[Project: ${sourceProject}] ${message}` : message);
    this.name = 'ReferenceResolutionError';
  }
}

export class CircularDependencyError extends Error {
  constructor(public readonly cyclePath: string[]) {
    super(`Circular dependency detected: ${cyclePath.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}
