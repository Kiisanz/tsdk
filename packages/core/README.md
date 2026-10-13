# @tsdk/core

TSDK Core provides the foundational models and parsers for declarative TypeScript projects (`.tsproj`), workspaces (`.tswork`), and DAG dependency graphs.

## Features

- **Project Manifest Parser**: Strongly typed YAML schema parser and validator for `.tsproj` files.
- **Workspace Manager**: `.tswork` parsing with hierarchical resolution and glob-based project discovery.
- **Project Graph Engine**: Directed Acyclic Graph (DAG) for dependency resolution, topological sort, circular dependency detection, and transitive reference computation.
- **Unified Diagnostics**: Standard diagnostic formatting (`TSDK1xxx` - `TSDK4xxx`) with code fix hints.

## Installation

```bash
npm install @tsdk/core
```

## License

MIT
