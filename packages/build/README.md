# @tsdk/build

Compiler configuration generator, build orchestrator, and package synchronization engine for TSDK.

## Features

- **Single Build Pipeline**: Generates tsconfig project references (`composite: true`, `declaration: true`) dynamically without duplicating build graphs.
- **Orchestration**: Executes incremental builds (`tsc -b`) in topological dependency order.
- **Package Reference Synchronization**: Keeps project manifest dependencies in sync with `package.json` (`tsdk restore`).
- **Import Validation**: Enforces project reference boundaries at compile-time.

## Installation

```bash
npm install @tsdk/build
```

## License

MIT
