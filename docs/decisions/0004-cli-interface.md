# ADR 0004: @tsdk/cli Interface & Context Discovery Specification

## Status
Accepted

## Context
`@tsdk/cli` serves as the official developer-facing command line interface for TSDK.
Its role is presentation and orchestration: delegating manifest reading, graph calculation, and build orchestration to `@tsdk/core` and `@tsdk/build` without duplicating engine logic.

## Command Set (v0.1)
1. `tsdk build`: Builds the targeted project or workspace. Supports `--rebuild`/`--force`, `--verbose`, and `--workspace`/`-w`.
2. `tsdk restore`: Synchronizes declared references into `package.json` (`workspace:*`).
3. `tsdk clean`: Cleans compilation outputs (`dist/`) and build caches.
4. `tsdk project list`: Displays project details or workspace registry table.
5. `tsdk graph`: Visualizes the dependency graph, showing dependencies, dependents, and topological build order.

## Context Discovery Rules (Refined)
To align with the developer experience (analogous to `dotnet build` within a project folder):
1. **Nearest Project Prioritized by Default**:
   - Traverses upwards from `process.cwd()`.
   - If a `*.tsp` project manifest is encountered, execution targets that **project** specifically.
   - If that project belongs to an enclosing workspace (`*.tsw` further up the directory tree), the parent workspace is loaded to resolve workspace references, but the compilation target remains exclusively that project (and its direct/transitive dependencies).
2. **Explicit Workspace Execution via `--workspace` / `-w`**:
   - When `--workspace` or `-w` is passed, upward traversal searches directly for the enclosing `*.tsw` and executes across the whole workspace solution.
3. **Workspace Root Execution**:
   - When executed in the directory containing `*.tsw` (with no `.tsp` at that directory level), execution automatically targets the full workspace.
4. **Standalone Execution**:
   - When a `.tsp` is found with no parent `.tsw` in the directory hierarchy, it executes in standalone project mode.
