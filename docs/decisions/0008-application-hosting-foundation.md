# ADR 0008: Application Hosting Foundation (@tsdk/hosting)

## Status
Accepted

## Context
Following the completion of the TSDK Core and Build foundation, TSDK requires an Application SDK layer to support application runtime execution across different application models (`console`, `worker`, and future `webapi`).
Rather than coupling hosting to HTTP/Web API directly, a unified Application Host foundation is established.

## Decisions

### 1. Package Boundary & Separation of Concerns
- Implement `@tsdk/hosting` under `packages/hosting/`.
- Runtime library murni: zero dependency on `@tsdk/build` or `@tsdk/cli`.
- Compiled applications can run directly with `node dist/main.js` without requiring TSDK CLI globally.

### 2. Hosted Services Abstraction (`HostedService`)
- Define the contract for background and continuous execution:
  ```typescript
  export interface HostedService {
    start(signal: AbortSignal): Promise<void>;
    stop(signal: AbortSignal): Promise<void>;
  }
  ```
- Provide `BackgroundService` as an abstract base class for long-running worker tasks.
- Web API and workers participate as hosted services without modifying the core host.

### 3. Strict Dependency Injection Lifetimes
- Support lifetimes: `Singleton`, `Scoped`, `Transient`.
- Token-based & factory-based injection without requiring decorators or `reflect-metadata`.
- **Captive Dependency Prevention**: Disallow resolving a `Scoped` service from root/singleton context. If a scoped service is requested from the root provider, throw `CaptiveDependencyError`.
- **Scoped Resolution**: Scoped instances are resolved exclusively through `provider.createScope()`.
- **Disposal**: Container-owned instances implementing `dispose()`, `[Symbol.dispose]`, or `[Symbol.asyncDispose]` are disposed when their scope or the container shuts down.
- **Circular Dependency Detection**: Circular references in factory chains are detected and rejected with `CircularDependencyError`.

### 4. Ordered Configuration Pipeline
- Configuration is loaded via an ordered pipeline of providers:
  1. In-memory defaults
  2. JSON configuration (`appsettings.json`, `appsettings.{env}.json`)
  3. Environment variables (optional prefix)
  4. Command-line arguments
- Later providers override earlier ones.
- Generic `config.get<T>(key, defaultValue)` helper provides compile-time typing without fake runtime casting.

### 5. Deterministic Lifecycle & Partial Startup Failure Rollback
- **Sequential Startup**: Hosted services start sequentially in order of registration.
- **Reverse Shutdown**: Hosted services stop in reverse order of registration.
- **Partial Startup Failure**: If a service fails to start, services that already started are stopped in reverse order before the host rejects.
- **Graceful Shutdown**: Handles OS signals (`SIGINT`, `SIGTERM`) with configurable timeout (default 30s) and cancellation signal.
- **Idempotency**: `stop()` can be called multiple times safely.

### 6. Distinct `start()` and `run()` Contracts
- `app.start()`: Starts hosted services and returns immediately.
- `app.run()`: Starts hosted services and blocks until a shutdown signal or explicit `stop()` is triggered.
- `app.stop()`: Explicitly triggers graceful shutdown.
