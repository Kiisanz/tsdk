# ADR 0006: Foundation Hardening (Lifecycle Resilience, Drift Detection & Cross-Platform Parity)

## Status
Accepted (Refined)

## Context
Following the completion of the Foundation MVP, the system must be hardened against real-world development scenarios:
1. **Project Lifecycle Resilience**: Ensuring moving/renaming projects or deleting cache doesn't leave orphaned configs or crash the build.
2. **Cross-Platform Compatibility**: Ensuring path normalization, POSIX relative slashes in all generated tsconfigs and manifests, and case-sensitive/insensitive filesystem parity.
3. **Package Consistency & Drift Detection**: Ensuring `.tsproj`, `package.json`, and TypeScript project references remain strictly synchronized.

## Decisions

### 1. Scoped Pruning of Generated Configurations
- Pruning of stale `*.tsconfig.json` files is strictly scoped:
  - When `scope === 'workspace'`, pruning checks `knownProjectNames` (all projects registered in `workspace.projects`). Only files matching `<ProjectName>.tsconfig.json` whose project is no longer registered in the workspace are pruned.
  - When `scope === 'project'`, pruning of other project configurations is completely skipped. Building one project inside or outside a workspace will never delete or disturb the generated configurations of other projects.

### 2. Selective Workspace Package Pruning & Drift Guard
- `PackageSyncManager.syncWorkspacePackages`:
  - Injects missing required `workspace:*` dependencies for referenced projects.
  - Prunes obsolete `workspace:*` dependencies **only if the package is known to be managed by TSDK** (present in `allWorkspacePackageNames` from `workspace.projects`) and is no longer declared in `.tsproj.spec.references`.
  - Strictly preserves manually added `workspace:*` dependencies that reference non-TSDK packages in the monorepo (e.g. tools, configs, UI libraries without `.tsproj`).
  - Preserves third-party npm dependencies, scripts, and other fields.
- `PackageSyncManager.validateWorkspacePackages` and `BuildService.buildWorkspace`:
  - Ignores non-TSDK `workspace:*` dependencies during validation.
  - If TSDK-managed package dependencies diverge from `.tsproj.spec.references`, throws a descriptive `PackageDriftError` with actionable instructions (`Run "tsdk restore"`).

### 3. Cross-Platform POSIX Normalization & Windows Path Support
- All generated tsconfig options (`rootDir`, `outDir`, `tsBuildInfoFile`, `include`, `references`) strictly use forward slashes (`/`), guaranteeing cross-platform compatibility on Windows, Linux, and macOS.
- Verified with `path.win32`: handles Windows drive letters (`C:\...`), backslashes (`\`), and relative path calculations cleanly.
- `ProjectGraph` and `TsWorkspace` normalize backslashes in reference paths (`ref.path`) and workspace project entries (`projectEntry.path`), enabling manifests written on Windows to resolve seamlessly on Unix and vice versa.

### 4. Reference Management Command (`tsdk ref add <target>`)
- Provides `tsdk ref add <target>` to safely declare inter-project dependencies in `.tsproj` without manual YAML editing, followed by automatic `package.json` synchronization.
