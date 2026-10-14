import { ProjectCompilerSpec } from '../project/types.js';

export interface WorkspaceMetadata {
  name: string;
  scope?: string;
}

export interface WorkspaceProjectEntry {
  path: string;
}

export interface WorkspaceDefaults {
  runtime?: string;
  compiler?: ProjectCompilerSpec;
  [key: string]: unknown;
}

export interface TsWorkspaceManifest {
  schemaVersion: number;
  kind: 'Workspace';
  metadata: WorkspaceMetadata;
  projects: WorkspaceProjectEntry[];
  defaults?: WorkspaceDefaults;
}
