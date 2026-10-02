export interface SyncedProjectInfo {
  projectName: string;
  packageJsonPath: string;
  addedDependencies: string[];
  changed: boolean;
}

export interface PackageSyncResult {
  updatedProjects: string[];
  unchangedProjects: string[];
  syncedDependencies: Record<string, string[]>;
}

export interface MissingPackageDependency {
  project: string;
  packageJsonPath: string;
  expectedPackage: string;
}

export interface PackageDriftItem {
  project: string;
  packageJsonPath: string;
  packageName: string;
  reason: 'missing' | 'stale';
}

export interface PackageValidationResult {
  valid: boolean;
  drifts: PackageDriftItem[];
  missingDependencies: MissingPackageDependency[];
}
