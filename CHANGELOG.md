# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-10-16

### Fixed
- **Monorepo Package Registry Alignment**: Synchronized full multi-package release across npm registry resolving staging propagation for `@tsnx/core`, `@tsnx/hosting`, and `@tsnx/openapi`.

---

## [1.0.1] - 2026-10-16

### Fixed
- **Interface Contract Alignment**: Exported `IHostedService` type alias in `@tsnx/hosting` and `@tsnx/hosting-abstractions` aligning with `IServiceProvider`, `IConfiguration`, and `IExceptionHandler`.
- **Database & ORM Cleanup**: Documented official patterns for clean disposal of external connections (MikroORM, Prisma) via container lifecycle and hosted services.

---

## [1.0.0] - 2026-10-16

### Added
- **Workspace Tooling & Scaffolding**: Built-in production setup on `tsnx workspace init` generating `.gitignore`, `.editorconfig`, and preconfigured linters/formatters.
- **Pluggable Linter & Formatter Toolchains**: Added `--lint <eslint|biome>`, `--no-lint`, `--format <prettier|biome>`, and `--no-format` flags to customize developer workflow.
- **Multi-Target Project References**: `tsnx ref add` and `tsnx ref remove` now accept multiple project targets concurrently with dual-wiring (`tsconfig.json` + `package.json`).
- **Smart Diagnostics & Typo Suggestions**: Levenshtein distance matching for missing workspace projects with distinct troubleshooting messages for non-workspace external npm dependencies.
- **Flexible Package Depth**: Workspace patterns default to 3-level depth (`*`, `*/*`, `*/*/*`) with `--depth <n>`, `--packages <globs>`, and auto-expanding hierarchy for deeply nested modules.

### Improved
- **RFC 9457 Problem Details Validation**: Documented canonical integration for application-level `ValidationException` via `IExceptionHandler` returning `Results.validationProblem`.
- **Repository Integrity**: Added `.editorconfig`, `.prettierrc`, and `.prettierignore` to root repository workspace.

---

## [1.0.0-rc.1] - 2026-10-15

### Added
- **Web API Core**: Native HTTP server engine with layered onion middleware pipeline, routing delegate, and endpoint filters.
- **Dependency Injection**: Full lifetime semantics (`Singleton`, `Scoped`, `Transient`), circular dependency detection, captive dependency prevention, and automatic reverse-order disposal.
- **Hosted Services & Lifecycle**: Graceful shutdown coordinator, `BackgroundService`, timeout cancellation enforcement, and `HostApplicationLifetime`.
- **Declarative Request Binding**: Strict runtime schema binding for bodies, query parameters, route segments, and headers with recursive type inference (`InferField<T>`).
- **OpenAPI 3.1 & Scalar Integration**: Automatic OpenAPI document generation (`@tsnx/openapi`) and embedded interactive API reference UI (`@tsnx/scalar`).
- **Project System & CLI**: Multi-project solution workspaces (`.tswork` / `.tsproj`), DAG compilation orchestrator, package manager auto-detection, and unified CLI commands (`create`, `build`, `run`, `test`, `watch`, `restore`).

### Fixed
- **Synchronous Reentrancy on Shutdown (M-18)**: Pre-instantiated shared stop and dispose promises synchronously before notify callbacks to prevent duplicate executions.
- **Chained Async Rollback (M-20)**: Implemented sequential async disposal rollback in `HostApplicationBuilder` so container dependencies remain alive until hosted services complete async disposal.
- **Recursive Array & Nullable Type Inference (M-22)**: Supported arbitrary nesting of `array()`, `nullable()`, and `optional()` descriptors in compile-time type inference.
- **Subtree Watcher Lifecycle & Stale Handle Pruning (M-24)**: Replaced flat watcher set with instance-identity registry; automatically pruned dead watchers on directory removal and re-armed fresh watchers on rapid recreation without handle leaks.
- **Single-Flight Shared Host Initialization (M-25)**: Coordinated concurrent `WebApplication.start()` invocations via a shared initialization promise, preventing duplicate host creation and leaked signal listeners.
- **Zero-Falsy Worker Rejections (L-02)**: Ensured background worker errors with falsy values (`0`, `""`, `null`) reject `app.run()` deterministically.

---

## [0.4.1] - 2026-10-14
- Initial milestone release with core workspace orchestration, basic Web API pipeline, and preliminary CLI scaffolding.
