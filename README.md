# TSNX

A self-contained, .NET SDK-inspired project system, application framework, and CLI for TypeScript and Node.js.

TSNX simplifies building scalable, multi-project TypeScript solutions by introducing declarative project manifests (`.tsproj`, `.tswork`), strict project reference boundaries, unified diagnostics, unified application hosting (`@tsnx/hosting`), high-performance HTTP Web API foundations (`@tsnx/web`), and developer-centric CLI tooling (`@tsnx/cli`).

## Packages

| Package | Version | Description |
|---|---|---|
| [`@tsnx/core`](./packages/core) | `1.0.0-rc.1` | Project manifests (`.tsproj`), workspaces (`.tswork`), and DAG dependency graph |
| [`@tsnx/hosting-abstractions`](./packages/hosting-abstractions) | `1.0.0-rc.1` | Zero-dependency contracts for DI (`IServiceCollection`), Config, Logging & Lifecycle |
| [`@tsnx/hosting`](./packages/hosting) | `1.0.0-rc.1` | Application hosting, Dependency Injection, Configuration, Logging & Hosted Services |
| [`@tsnx/build`](./packages/build) | `1.0.0-rc.1` | Compiler configuration generator, orchestrator, and package synchronization |
| [`@tsnx/web`](./packages/web) | `1.0.0-rc.1` | Native HTTP Web API engine, onion middleware, route matching, and request-scoped DI |
| [`@tsnx/openapi`](./packages/openapi) | `1.0.0-rc.1` | Automatic OpenAPI 3.1 specification generation from route definitions |
| [`@tsnx/scalar`](./packages/scalar) | `1.0.0-rc.1` | Embedded interactive Scalar API reference documentation endpoint |
| [`@tsnx/cli`](./apps/cli) | `1.0.0-rc.1` | Unified CLI (`tsnx create`, `build`, `run`, `test`, `watch`, `restore`) |

For differences from ASP.NET Core, see [Known Limitations & Differences](./docs/KNOWN_LIMITATIONS.md).
For release history, see [Changelog](./CHANGELOG.md).
For security policy, see [Security Policy](./SECURITY.md).

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
