# ADR 0005: Project Scaffolding & Direct Execution (tsdk create, run, workspace)

## Status
Accepted

## Context
With the baseline foundation established, developers need commands to initialize projects, workspaces, and immediately execute applications without manually writing YAML manifests or invoking `node` on compiled artifacts.

## Decisions

### 1. Project Scaffolding (`tsdk create <template> <name>`)
- Supported templates: `console`, `library`.
- Generates:
  - `<name>/<name>.tsp`: Valid `.tsp` manifest with corresponding `spec.type`.
  - `<name>/package.json`: Minimal npm package metadata (`name`, `version: 0.1.0`, `type: module`).
  - `<name>/src/main.ts` (console) or `<name>/src/index.ts` (library) with working starter code.
- If executed inside an existing workspace (`parentWorkspace` detected), automatically registers the new project into the workspace manifest (`*.tsw`).

### 2. Direct Application Execution (`tsdk run [args...]`)
- Ensures the project is built first (invokes `BuildService.buildProject`).
- Resolves the entry point output file from `spec.source.entry` mapping `src/*.ts` to `dist/*.js`.
- Spawns `node` with `stdio: inherit`, forwarding any application arguments.
- Only supported for projects with executable entry points (e.g., `console`, `webapi`).

### 3. Workspace Initialization & Management (`tsdk workspace init`, `tsdk workspace add`)
- `tsdk workspace init <name>`: Scaffolds `<name>.tsw` (and `pnpm-workspace.yaml` if absent).
- `tsdk workspace add <path>`: Validates the target `.tsp` file, computes the relative path to the `.tsw`, and idempotently adds `{ path: ... }` to `projects`.
