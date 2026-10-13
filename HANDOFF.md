# Handoff Session: TSNX Foundation & Packaging (@tsnx/*)

## 1. Overview
Codebase telah selesai di-rebrand dari TSDK menjadi **TSNX** di bawah scope npm `@tsnx/*`, dengan binary CLI `tsnx`, tanpa mengubah format deklaratif manifest (`.tsproj`, `.tswork`). Seluruh 83 unit & integration tests di 5 packages lolos 100%.

---

## 2. Rebranding Summary & Arsitektur
1. **NPM Organization & Package Scopes**:
   - `@tsnx/core`
   - `@tsnx/hosting`
   - `@tsnx/build`
   - `@tsnx/web`
   - `@tsnx/cli`
2. **Binary Executable**:
   - `tsnx` (`apps/cli/package.json` $\to$ `"bin": { "tsnx": "./dist/index.js" }`).
3. **Manifest Invariance**:
   - Format file `.tsproj` dan `.tswork` dipertahankan tanpa perubahan karena merepresentasikan konsep universal TypeScript Project dan TypeScript Workspace.
4. **Diagnostic Namespace**:
   - `TSNX1xxx`: Manifest & Schema errors (`TSNX1001`).
   - `TSNX2xxx`: Reference Enforcement errors (`TSNX2101`, `TSNX2102`, `TSNX2103`).
   - `TSNX4xxx`: Runtime / Lifecycle structured errors.
   - Native TypeScript compiler codes (`TSxxxx`) dipertahankan secara utuh.
5. **Build Cache Directory**:
   - Berpindah dari `.tsdk/generated/` menjadi `.tsnx/generated/`.

---

## 3. Implementasi Web API & Hosting Foundation
- **Kontrak Route Handler & Results**:
  - `Results.json()`, `Results.ok()`, `Results.text()`, `Results.created()`, `Results.noContent()`, `Results.notFound()`, `Results.badRequest()`, `Results.problem()`.
- **Middleware Pipeline**:
  - Guard terhadap duplicate `next()` calls dalam satu middleware frame.
- **Request-Scoped DI & AbortSignal**:
  - `ctx.services` di-dispose deterministik di `finally` block setelah stream selesai.
  - Client disconnect prematur mentrigger `ctx.request.signal` abort.
- **Streaming & Security Hardening**:
  - `StreamResult` dengan backpressure streaming (`node:stream/promises`).
  - RFC HTTP header validation (`validateHeaderName`, `validateHeaderValue` dari `node:http`).
  - Slowloris timeout protection (`headersTimeout`).
  - Payload limiting 413 Payload Too Large.

---

## 4. Developer Tooling (`watch`, `test`, and Unified Diagnostics)
- **`tsnx watch`**: Single-flight build + dirty flag + `buildGeneration` token guard untuk mengeliminasi race conditions pada concurrent rebuild/slow shutdown.
- **`tsnx test`**: ESM & standard test extensions discovery (`*.test.js`, `*.spec.js`, `*.test.mjs`, `*.spec.mjs`) di `dist/` dengan exit code non-zero propagation untuk CI/CD.
- **`tsnx create`**: Template generator untuk console, library, dan webapi (`@tsnx/web: 0.1.0-rc.1`).

---

## 5. TSNX Packaging, Distribution & Release Engineering (v0.1.0-rc.1)

Berdasarkan [ADR 0012](file:///home/aras/Documents/explore/tsdk/docs/decisions/0012-packaging-and-distribution.md):
- **Package Integrity**: Whitelist `dist/` dan `README.md` pada setiap package, target ESM dan d.ts valid, Node.js `>=18.0.0`.
- **Isolated Consumer Verification**: Tarball pack & isolated consumer installation diuji otomatis di [`packaging.test.ts`](file:///home/aras/Documents/explore/tsdk/apps/cli/src/__tests__/packaging.test.ts) (`create` $\to$ `restore` $\to$ `build` $\to$ `run` $\to$ `test`).
- **GitHub Actions Workflows**:
  - CI Matrix: Linux, Windows, macOS pada Node 18, 20, 22 ([`.github/workflows/ci.yml`](file:///home/aras/Documents/explore/tsdk/.github/workflows/ci.yml)).
  - Release Workflow: Publish otomatis ke npm registry saat tag `v*` di-push atau via manual dispatch ([`.github/workflows/release.yml`](file:///home/aras/Documents/explore/tsdk/.github/workflows/release.yml)).
- **Publish Dry Run**: Terverifikasi lokal via `pnpm -r publish --access public --tag rc --no-git-checks --dry-run` (exit code 0 untuk seluruh package).

---

## 6. Hasil Pengujian Monorepo

Seluruh **83 unit & integration test** di 5 paket monorepo lolos 100%:
- **`@tsnx/core`**: 20 tests
- **`@tsnx/hosting`**: 17 tests
- **`@tsnx/build`**: 17 tests
- **`@tsnx/web`**: 20 tests
- **`@tsnx/cli`**: 9 tests

```bash
# Perintah verifikasi menyeluruh:
pnpm run build
pnpm test
pnpm -r publish --access public --tag rc --no-git-checks --dry-run
```

