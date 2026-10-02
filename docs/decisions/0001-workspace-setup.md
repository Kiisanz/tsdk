# ADR 0001: Initial Monorepo Setup with pnpm & TypeScript Project References

## Status
Accepted

## Context
TSDK (TypeScript Development Kit) is designed to bring a .NET SDK-like developer experience to TypeScript projects using native tooling (`tsc`, `pnpm`, Node.js).
The project requires a monorepo setup containing:
- `packages/core`: The core engine responsible for Project (`.tsp`), Workspace (`.tsw`), and Reference Graph models.
- `apps/cli`: The command-line interface entry point (`tsdk`).

## Decisions
1. **Package Manager**: pnpm workspace (`pnpm-workspace.yaml`) with `packages/*` and `apps/*`.
2. **TypeScript Compilation**: TypeScript Project References (`composite: true`, `tsc -b`).
   - `tsconfig.base.json`: Shared base compiler options (`target: ES2022`, `module: NodeNext`, strict mode).
   - `tsconfig.json`: Root references linking `packages/core` and `apps/cli`.
   - `packages/core/tsconfig.json` & `apps/cli/tsconfig.json`: Composite configs with project references.
3. **Module Format**: Pure ESM (`"type": "module"`), NodeNext module resolution.

## Consequences
- Fast incremental typechecking and builds via `pnpm run build` (`tsc -b`).
- Strict module boundaries between workspace packages.
- Ready for Stage 1 implementation: Project (`.tsp`), Workspace (`.tsw`), and Reference Graph.
