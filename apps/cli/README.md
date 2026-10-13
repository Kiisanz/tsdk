# @tsdk/cli

Unified command-line interface for TSDK (TypeScript Development Kit).

## Commands

- `tsdk create <template> <name>`: Scaffold console, library, or webapi project.
- `tsdk build`: Incremental compilation using composite project references.
- `tsdk run`: Run console or Web API applications.
- `tsdk test`: Run project test suites with ESM discovery and exit code propagation.
- `tsdk watch`: Single-flight incremental watcher with live process supervisor.
- `tsdk restore`: Synchronize project references with package.json dependencies.
- `tsdk clean`: Remove build artifacts and compiler caches.
- `tsdk graph`: Visualize project dependency graph.
- `tsdk project list`: List projects in current workspace.
- `tsdk ref add <target>`: Add a project reference to current project.

## Installation

```bash
npm install -g @tsdk/cli
```

## License

MIT
