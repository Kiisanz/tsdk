# TSNX

A self-contained, .NET SDK-inspired project system, application framework, and CLI for TypeScript and Node.js.

TSNX simplifies building scalable, multi-project TypeScript solutions by introducing declarative project manifests (`.tsproj`, `.tswork`), strict project reference boundaries, unified diagnostics, unified application hosting (`@tsnx/hosting`), high-performance HTTP Web API foundations (`@tsnx/web`), and developer-centric CLI tooling (`@tsnx/cli`).

## Packages

| Package | Version | Description |
|---|---|---|
| [`@tsnx/core`](./packages/core) | `0.2.2` | Project manifests (`.tsproj`), workspaces (`.tswork`), and DAG dependency graph |
| [`@tsnx/hosting`](./packages/hosting) | `0.2.2` | Application hosting, Dependency Injection, Configuration, Logging & Hosted Services |
| [`@tsnx/build`](./packages/build) | `0.2.2` | Compiler configuration generator, orchestrator, and package synchronization |
| [`@tsnx/web`](./packages/web) | `0.2.2` | Native HTTP Web API engine, onion middleware, route matching, and request-scoped DI |
| [`@tsnx/cli`](./apps/cli) | `0.2.2` | Unified CLI (`tsnx create`, `build`, `run`, `test`, `watch`, `restore`) |

## Quick Start

### Installation

```bash
npm install -g @tsnx/cli
# Or run with pnpm
pnpm add -g @tsnx/cli
```

### Create a Web API

```bash
tsnx create webapi MyApi
cd MyApi
tsnx run
```

### Create a Console Application or Library

```bash
tsnx create console MyTool
tsnx create library MyLib
```

## License

MIT
