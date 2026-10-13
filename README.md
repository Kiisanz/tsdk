# TSDK (TypeScript Development Kit)

A self-contained, .NET SDK-inspired project system, application framework, and CLI for TypeScript and Node.js.

TSDK simplifies building scalable, multi-project TypeScript solutions by introducing declarative project manifests (`.tsproj`, `.tswork`), strict project reference boundaries, unified diagnostics, unified application hosting (`@tsdk/hosting`), high-performance HTTP Web API foundations (`@tsdk/web`), and developer-centric CLI tooling (`@tsdk/cli`).

## Packages

| Package | Version | Description |
|---|---|---|
| [`@tsdk/core`](./packages/core) | `0.1.0-rc.1` | Project manifests (`.tsproj`), workspaces (`.tswork`), and DAG dependency graph |
| [`@tsdk/hosting`](./packages/hosting) | `0.1.0-rc.1` | Application hosting, Dependency Injection, Configuration, Logging & Hosted Services |
| [`@tsdk/build`](./packages/build) | `0.1.0-rc.1` | Compiler configuration generator, orchestrator, and package synchronization |
| [`@tsdk/web`](./packages/web) | `0.1.0-rc.1` | Native HTTP Web API engine, onion middleware, route matching, and request-scoped DI |
| [`@tsdk/cli`](./apps/cli) | `0.1.0-rc.1` | Unified CLI (`tsdk create`, `build`, `run`, `test`, `watch`, `restore`) |

## Quick Start

### Installation

```bash
npm install -g @tsdk/cli
# Or run with pnpm
pnpm add -g @tsdk/cli
```

### Create a Web API

```bash
tsdk create webapi MyApi
cd MyApi
tsdk run
```

### Create a Console Application or Library

```bash
tsdk create console MyTool
tsdk create library MyLib
```

## License

MIT
