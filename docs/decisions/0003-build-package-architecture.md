# ADR 0003: @tsdk/build Package Architecture & Execution Plan

## Status
Accepted

## Context
Following the completion of `@tsdk/core`, the build orchestration subsystem must be implemented as a separate package `@tsdk/build`.
The purpose of `@tsdk/build` is to take `.tsp` / `.tsw` manifests and project graphs, generate appropriate TypeScript project references configurations (`tsconfig.json`), enforce reference boundaries, synchronize package dependencies, and execute `tsc --build`.

## Architectural Decisions

### 1. Generated Config Location (.tsdk/generated/)
- **Workspace-centric (Root)**:
  ```
  <workspaceRoot>/
  └── .tsdk/
      └── generated/
          ├── tsconfig.json              # Solution root tsconfig with references to all projects
          ├── <ProjectA>.tsconfig.json   # Generated project config
          └── <ProjectB>.tsconfig.json
  ```
- **Standalone**: `<projectRoot>/.tsdk/generated/tsconfig.json`.
- Configs set `composite: true`, `declaration: true`, explicit project references, and appropriate `rootDir` / `outDir` pointing to each project's source and `dist/`.
- `tsBuildInfoFile` points into `.tsdk/generated/.cache/<project>.tsbuildinfo` or `<project>/dist/.tsbuildinfo`.

### 2. Package Integration (Sync & Validation)
- Local project references are mapped to npm package names via `spec.package.name`.
- Target dependency injected into declaring project's `package.json` as `"@scope/pkg": "workspace:*"`.
- Idempotent and non-destructive: existing custom dependencies, scripts, and other package.json fields are preserved.
- Separation of duties:
  - `syncPackageReferences` (Restore phase): performs modification to `package.json`.
  - `validatePackageReferences` (Build phase): verifies synchronization prior to compilation.

### 3. AST-based Reference Enforcement
- Uses the **TypeScript Compiler API** (not regex).
- Analyzes import declarations, `export ... from`, `require()`, and dynamic `import()`.
- Validates target file ownership using normalized paths and realpaths (resolving pnpm symlinks).
- Diagnostics:
  - `TSDK2101`: Undeclared project reference (attempting to import transitive or unreferenced workspace project).
  - `TSDK2102`: Cross-project relative import (attempting relative import that crosses project boundaries).

### 4. Milestones Plan
- **M1**: Compiler config generation (`.tsdk/generated/` generation for standalone and workspaces).
- **M2**: Build orchestration (`tsc --build` invocation, error propagation, output in `dist/`).
- **M3**: Package integration (`package.json` synchronization and validation).
- **M4**: Reference enforcement (AST-based import validator via TypeScript Compiler API).
- **M5**: Build lifecycle & diagnostics (`build`, `rebuild`, `clean`, diagnostic codes).
