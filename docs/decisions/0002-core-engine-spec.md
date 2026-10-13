# ADR 0002: TSDK Core Engine v0.1 Specification

## Status
Accepted

## Context
TSDK Core v0.1 serves as the foundational project system for TypeScript. It is responsible for parsing manifests, managing workspace registries, resolving project references, and computing the dependency graph.

## Decision Summary

### 1. File Formats
- `.tsp`: TypeScript Project manifest in YAML.
- `.tsw`: TypeScript Workspace manifest in YAML.

### 2. .tsp Schema
- `schemaVersion`: 1 (number, required).
- `kind`: "Project" (string, required).
- `metadata`:
  - `name`: string, required (TSDK project identity, unique case-insensitively).
  - `version`: string, optional (default: "0.1.0").
- `spec`:
  - `type`: "console" | "library" | "webapi" | "worker" | "test" (required).
  - `runtime`: string, optional (default: "node").
  - `package`: optional `{ name: string, private?: boolean }`.
  - `source`: optional `{ root?: string, entry?: string }`.
  - `compiler`: optional compiler options mapping.
  - `references`: optional array of `{ project: string, path?: string }` (default: `[]`).

### 3. .tsw Schema
- `schemaVersion`: 1 (number, required).
- `kind`: "Workspace" (string, required).
- `metadata`:
  - `name`: string, required.
- `projects`: array of `{ path: string }` (required, explicit relative paths).
- `defaults`: optional `{ runtime?: string, compiler?: Record<string, unknown> }`.

### 4. Reference Validation & Graph Resolution Rules
- Case-insensitive unique project names within a workspace.
- Self-references rejected.
- Unresolved references rejected.
- Duplicate references in the same project rejected.
- Inside workspace: references resolve by `project` name; optional `path` must match registry if provided.
- Standalone project (no workspace): references must provide `path`.
- Circular dependencies detected and rejected with full cycle path.
- Computes topological sort for build/execution order.
