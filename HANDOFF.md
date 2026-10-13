# Handoff Session: TSDK Web API Foundation (@tsdk/web)

## 1. Overview
Paket **`@tsdk/web`** telah diimplementasikan sebagai fondasi HTTP server, routing, middleware pipeline, dan request-scoped lifecycle di atas `@tsdk/hosting`. Seluruh 5 poin arsitektur & refinement dari tech lead telah diterapkan dan diverifikasi melalui unit & integration tests.

---

## 2. Implementasi 5 Poin Refinement

### A. Konsistensi Kontrak Route Handler vs Middleware
- [`RouteHandler`](file:///home/aras/Documents/explore/tsdk/packages/web/src/http/results.ts) mengembalikan `HttpResult | Promise<HttpResult>`, memisahkan penulisan response dari low-level `ServerResponse`.
- Result helpers disediakan via `Results.json()`, `Results.ok()`, `Results.text()`, `Results.created()`, `Results.noContent()`, `Results.notFound()`, `Results.badRequest()`, dan `Results.problem()`.
- [`Middleware`](file:///home/aras/Documents/explore/tsdk/packages/web/src/middleware/pipeline.js) bertipe `(ctx: HttpContext, next: RequestDelegate) => Promise<void>`.

### B. Perlindungan Multiple `next()` pada Middleware
- [`MiddlewarePipeline`](file:///home/aras/Documents/explore/tsdk/packages/web/src/middleware/pipeline.ts) melacak status pemanggilan `next()` per middleware frame.
- Jika `next()` dipanggil lebih dari satu kali dalam satu frame middleware, pipeline melempar `Error('Invalid operation: next() was already called within this middleware.')`.

### C. Request Lifecycle & Abort Handling
- [`HttpContext`](file:///home/aras/Documents/explore/tsdk/packages/web/src/http/http-context.ts) menyediakan `ctx.request.signal` (`AbortSignal`).
- `HttpServerHostedService` memicu abort saat client terputus prematur (`req.on('close')` sebelum response selesai).
- Request-scoped DI container (`serviceProvider.createScope()`) ditempelkan pada `ctx.services` dan di-dispose secara deterministik pada blok `finally` setelah pipeline selesai atau dibatalkan secara kooperatif.

### D. Routing Deterministik
[`Router`](file:///home/aras/Documents/explore/tsdk/packages/web/src/routing/router.ts) mengimplementasikan aturan HTTP deterministik:
1. **Prioritas Statis vs Param**: Segmen statis memiliki prioritas lebih tinggi daripada named parameter (`/users/profile` mendahului `/users/:id`).
2. **Safe URL Decoding**: Parameter di-decode dengan aman (`decodeURIComponent`).
3. **Malformed URL Encoding**: Mengembalikan status 400 Bad Request jika encoding rusak.
4. **404 Not Found**: Jika tidak ada path pattern yang cocok.
5. **405 Method Not Allowed + Allow Header**: Jika path cocok namun method HTTP berbeda.
6. **Duplicate Route Guard**: Melempar exception jika pattern + method identik didaftarkan ulang.

### E. Response & Error Handling yang Aman (Response-State Aware)
- Error handler memeriksa `ctx.response.hasStarted` (`headersSent`).
- Jika error terjadi setelah header/chunk mulai dikirim, server tidak mencoba menulis status 500 JSON (yang akan memicu runtime crash `ERR_HTTP_HEADERS_SENT`), melainkan mencatat log dan menghentikan/menutup stream koneksi.
- Request body reader (`readText()`, `readJson()`) membatasi ukuran body melalui `maxBodySizeBytes` (default 1MB, configurable), melempar 413 Payload Too Large jika batas terlampaui.

### F. HTTP Protocol Correctness, Lifetime & Security Hardening
- **Streaming & Scoped DI Lifetime**:
  - `StreamResult` memanggil `await pipeline(stream, res, { signal })`.
  - Terbukti secara deterministik melalui integration test: `requestScope.dispose()` di blok `finally` pada `handleRequest()` dijamin **menunggu sampai streaming selesai seutuhnya** (semua chunk data terkirim) sebelum memicu pembersihan resource scoped DI.
- **Header Hardening**:
  - `setHeader()` memanfaatkan langsung validator resmi bawaan Node.js (`validateHeaderName`, `validateHeaderValue` dari `node:http`) sehingga menjamin kepatuhan penuh terhadap RFC HTTP header specs dan perlindungan CRLF injection.
- **Body Limits & Timeout Architecture**:
  - `maxBodySizeBytes` (default 1MB) membatasi `readText()` / `readJson()`, melempar 413 Payload Too Large.
  - Memisahkan antara `requestHeadersTimeoutMs` (default 30s di `server.headersTimeout` untuk proteksi *Slowloris* sebelum body/header selesai diterima) dan `requestTimeoutMs` (default 0 / disabled untuk mendukung streaming jangka panjang yang sehat seperti SSE atau file download/upload).
  - Status `408 Request Timeout` secara ketat hanya ditulis jika headers belum terkirim (`!res.headersSent`). Jika headers sudah terkirim, socket stream di-destroy secara aman tanpa merusak format data.
- **RFC Status Code Nuances**:
  - **204 No Content**: Wajib menghapus `Content-Length` & `Content-Type` serta tidak memiliki body.
  - **304 Not Modified**: Dikonfirmasi hanya mengosongkan body tanpa secara agresif menghapus header caching metadata (misal `ETag` atau `Content-Type` sesuai konteks HTTP).

---

## 3. Web API Developer Experience & Tooling Integration

- **`tsdk create webapi <Name>`**:
  - Menghasilkan `<Name>.tsproj` dengan `spec.type: webapi`.
  - Mengonfigurasi `package.json` dengan dependency `@tsdk/web`.
  - Menghasilkan `src/main.ts` menggunakan boilerplate resmi `WebApplication`, `Results.json()`, konfigurasi port runtime, dan endpoint `/` serta `/health`.
- **`tsdk run` Integration**:
  - Otomatis menjalankan build project Web API dan mengeksekusi `dist/main.js`.
  - Meneruskan sinyal `SIGINT` dan `SIGTERM` ke child process agar graceful shutdown dan connection draining berjalan deterministik.
- **Compiler Pipeline**:
  - Memanfaatkan compiler pipeline standar `@tsdk/build` tanpa modifikasi atau compiler pipeline baru.
- **End-to-End Verification**:
  - Ditambahkan automated test pada `scaffolding.test.ts` yang menguji siklus lengkap: `tsdk create webapi` $\to$ `tsdk build` $\to$ `tsdk run` $\to$ verifikasi respons endpoint `/` dan `/health` via HTTP fetch $\to$ graceful shutdown via `SIGTERM`.

---

## 4. TSDK Developer Tooling (`watch`, `test`, and Unified Diagnostics)

### A. `tsdk watch`
- Menggunakan model **Single-flight Build + Dirty Flag** dengan **Build Generation Guard**:
  - Mencegah overlapping builds ketika file dimodifikasi secara beruntun.
  - Perubahan selama build berlangsung menandai `dirty = true` dan memicu rebuild segera setelah kompilasi aktif selesai.
  - **Eliminasi Race Condition**: Ditambahkan `buildGeneration` token. Jika file berubah dengan cepat saat proses lama sedang melakukan *slow shutdown*, restart dibatalkan jika token generasi tidak cocok, menjamin proses baru hanya di-spawn dari kompilasi sukses yang paling mutakhir.
  - Saat build gagal: child process yang berjalan dihentikan secara graceful (`SIGTERM` $\to$ fallback `SIGKILL`) untuk mencegah developer menguji binary basi/stale, watcher tetap aktif menunggu perbaikan.
  - Watcher memantau source directory (`src/`) serta file manifest (`.tsproj`, `.tswork`, `package.json`).
  - Perubahan manifest memicu rediscovery context dan update watch path secara dinamis sebelum build berikutnya.

### B. `tsdk test`
- Menggunakan jalur build pipeline yang sama (`BuildService.buildProject` / `BuildService.buildWorkspace`) sebelum mengeksekusi test runner.
- **Dukungan ESM & Standard Test Extensions**: Melakukan discovery file test secara eksplisit (`*.test.js`, `*.spec.js`, `*.test.mjs`, `*.spec.mjs`) pada direktori output `dist/` tanpa mengandalkan shell globing lintas platform.
- **CI/CD Reliability**: Meneruskan exit code non-zero (`exitCode = 1`) jika ada test yang gagal baik pada tingkat project maupun `--workspace`.
- Jika tidak ada test yang ditemukan, sistem mencetak peringatan eksplisit (bukan sukses diam-diam).

### C. Unified Diagnostics
- `DiagnosticFormatter` menstandarkan format pesan: `<file>:<line>:<col> <severity> <code>: <message>` dengan fix suggestions (`💡 Fix:`).
- Namespace TSDK:
  - `TSDK1xxx`: Manifest & Schema errors.
  - `TSDK2xxx`: Reference Enforcement errors (`TSDK2101`, `TSDK2102`).
  - `TSDK4xxx`: Runtime / Lifecycle structured errors.
- **Preservasi Compiler Codes**: Error bawaan TypeScript (`TSxxxx`) tidak di-rename atau dimanipulasi, melainkan tetap dipertahankan keasliannya dan hanya distandarkan tata letak visualnya.

---

## 5. TSDK Packaging, Distribution & Release Engineering (v0.1.0-rc.1 Release Candidate)

Berdasarkan [ADR 0012](file:///home/aras/Documents/explore/tsdk/docs/decisions/0012-packaging-and-distribution.md), fase packaging dan distribusi telah diselesaikan dan dikonfigurasi untuk rilis **`v0.1.0-rc.1`**:

### A. Package Integrity & Manifest Publik
Setiap package publik (`@tsdk/core`, `@tsdk/hosting`, `@tsdk/build`, `@tsdk/web`, `@tsdk/cli`) versi `0.1.0-rc.1` telah diperbarui dengan metadata produksi:
- **`files` whitelist**: Hanya menyertakan folder `dist` dan `README.md` (mengecualikan `src/**`, `__tests__/**`, `.tsbuildinfo`, dan `tsconfig.json`).
- **`exports` & `types`**: Menjamin subpath exports dengan target ESM dan d.ts yang valid.
- **`bin` mapping**: `@tsdk/cli` mendeklarasikan `"bin": { "tsdk": "./dist/index.js" }` dengan shebang `#!/usr/bin/env node`.
- **`engines`**: Node.js `>=18.0.0` (kompatibel penuh dengan Node 18, 20, dan 22).
- **`license`**: `MIT`.
- **`publishConfig`**: `{ "access": "public" }`.
- **Dokumentasi**: Setiap paket dan root memiliki `README.md` tersendiri.

### B. Isolated Consumer Verification
Diuji melalui automated test suite di [`packaging.test.ts`](file:///home/aras/Documents/explore/tsdk/apps/cli/src/__tests__/packaging.test.ts):
1. Membuat tarball via `pnpm pack` untuk kelima paket (`tsdk-*-0.1.0-rc.1.tgz`).
2. Memverifikasi integritas arsip (tidak ada file source `src/` atau test yang bocor).
3. Menginstal seluruh tarball menggunakan `npm install` ke direktori sementara di luar monorepo (`os.tmpdir()`).
4. Menguji eksekusi CLI (`node_modules/.bin/tsdk --version` $\to$ `0.1.0-rc.1`).
5. Menguji alur hidup consumer:
   - **Console**: `tsdk create console` $\to$ `tsdk build` $\to$ `tsdk run`.
   - **Library**: `tsdk create library` $\to$ unit test discovery $\to$ `tsdk build` $\to$ `tsdk test`.
   - **Web API**: `tsdk create webapi` $\to$ install tarball $\to$ `tsdk build` $\to$ `tsdk run` $\to$ HTTP GET `/` dan `/health` $\to$ graceful shutdown `SIGINT`.
6. Terbukti 100% berfungsi mandiri tanpa ketergantungan pada source monorepo atau symlink internal.

### C. Cross-Platform CI & Release Automation
- **GitHub Actions CI Workflow** ([`.github/workflows/ci.yml`](file:///home/aras/Documents/explore/tsdk/.github/workflows/ci.yml)):
  - Matriks lintas platform: `ubuntu-latest`, `windows-latest`, `macos-latest`.
  - Matriks versi Node.js: `18.x`, `20.x`, `22.x`.
  - Menjalankan build, unit & integration tests, serta isolated consumer verification.
- **GitHub Actions Release Workflow** ([`.github/workflows/release.yml`](file:///home/aras/Documents/explore/tsdk/.github/workflows/release.yml)):
  - Mendukung dry-run publish melalui `workflow_dispatch` dengan dist-tag `--tag rc`.
  - Publikasi otomatis ke npm registry saat tag `v*` di-push.
- **Publish Dry Run**: Terverifikasi lokal via `pnpm -r publish --access public --tag rc --no-git-checks --dry-run` (exit code 0 untuk seluruh package).

---

## 6. Hasil Pengujian Monorepo

Seluruh **83 unit & integration test** di 5 paket monorepo lolos 100%:
- **`@tsdk/core`**: 20 tests
- **`@tsdk/hosting`**: 17 tests
- **`@tsdk/build`**: 17 tests
- **`@tsdk/web`**: 20 tests
- **`@tsdk/cli`**: 9 tests (+1 comprehensive Packaging & Isolated Consumer Verification test)

```bash
# Perintah verifikasi menyeluruh:
pnpm run build
pnpm test
pnpm -r publish --access public --tag rc --no-git-checks --dry-run
```

