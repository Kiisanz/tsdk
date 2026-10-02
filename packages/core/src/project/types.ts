export type ProjectType = 'console' | 'library' | 'webapi' | 'worker' | 'test';

export interface ProjectMetadata {
  name: string;
  version?: string;
}

export interface ProjectPackageSpec {
  name?: string;
  private?: boolean;
  [key: string]: unknown;
}

export interface ProjectSourceSpec {
  root?: string;
  entry?: string;
  [key: string]: unknown;
}

export interface ProjectCompilerSpec {
  target?: string;
  module?: string;
  strict?: boolean;
  [key: string]: unknown;
}

export interface ProjectReference {
  project: string;
  path?: string;
}

export interface ProjectSpec {
  type: ProjectType;
  runtime?: string;
  package?: ProjectPackageSpec;
  source?: ProjectSourceSpec;
  compiler?: ProjectCompilerSpec;
  references?: ProjectReference[];
  [key: string]: unknown;
}

export interface TsProjectManifest {
  schemaVersion: number;
  kind: 'Project';
  metadata: ProjectMetadata;
  spec: ProjectSpec;
}
