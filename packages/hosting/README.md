# @tsdk/hosting

Application hosting foundation for TSDK, inspired by ASP.NET Core Generic Host.

## Features

- **Dependency Injection Container**:
  - Lifetimes: `Transient`, `Scoped`, `Singleton`.
  - Captive dependency detection (e.g. Scoped dependencies injected into Singleton services).
  - Deterministic disposal (`IDisposable` / `IAsyncDisposable`).
- **Hierarchical Configuration Pipeline**:
  - Memory, JSON files, Environment Variables, and Command-Line argument providers.
- **Structured Logging**:
  - Leveled logging (`Trace`, `Debug`, `Information`, `Warning`, `Error`, `Critical`).
- **Hosted Services & Application Lifecycle**:
  - `IHostedService` / `BackgroundService`.
  - Coordinated graceful shutdown with cancellation tokens.

## Installation

```bash
npm install @tsdk/hosting
```

## License

MIT
