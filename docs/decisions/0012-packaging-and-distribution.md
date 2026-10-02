# ADR 0012: TSNX Packaging, Distribution & Release Engineering

## Status
Accepted

## Context
Setelah seluruh fondasi framework dan tooling development TSNX (`@tsnx/core`, `@tsnx/hosting`, `@tsnx/build`, `@tsnx/web`, dan `@tsnx/cli`) selesai dan diverifikasi pada 83 unit/integration test, fokus TSNX beralih ke **Packaging, Distribution, dan Release Engineering**.

Tujuan utama fase ini adalah membuktikan bahwa:
1. Setiap package publik TSNX memiliki metadata kemasan (`package.json`) yang lengkap dan valid: `files`, `exports`, `main`, `types`, `bin`, lisensi, dan dependensi terisolasi.
2. Developer di luar lingkungan monorepo TSNX dapat menginstal paket TSNX (melalui `npm pack` tarball / npm registry) dan langsung menjalankan alur kerja penuh: `tsnx create` $\to$ `tsnx restore` $\to$ `tsnx build` $\to$ `tsnx run` $\to$ `tsnx test` tanpa memerlukan akses ke source repository TSNX.
3. Alur rilis versi terkoordinasi (Unified Semantic Versioning) dan pipeline otomatisasi rilis siap dijalankan untuk rilis perdana **v0.1.0-rc.1** (Release Candidate) dengan dist-tag `--tag rc` di bawah organisasi npm `@tsnx/*`.

## Decisions

### 1. Standar Package Integrity & Manifest Publik
Setiap package yang dipublikasikan (`@tsnx/core`, `@tsnx/hosting`, `@tsnx/build`, `@tsnx/web`, `@tsnx/cli`) harus memenuhi standar:
- **`files` whitelist**: Hanya menyertakan folder `dist` dan `README.md` (mengecualikan `src`, test fixtures, dan konfigurasi lokal).
- **`exports` map**: Menyediakan subpath exports eksplisit dengan pemetaan `types` dan `import`.
- **`engines`**: Mendeklarasikan dukungan minimal Node.js (`>= 18.0.0`).
- **`license`**: `MIT`.
- **Executable binary**: `@tsnx/cli` mendeklarasikan `"bin": { "tsnx": "./dist/index.js" }` dengan shebang `#!/usr/bin/env node`.

### 2. Isolated Consumer Verification
- Menguji distribusi paket dengan membuat tarball (`npm pack` / `pnpm pack`) untuk setiap paket:
  - `tsnx-core-0.1.0-rc.1.tgz`
  - `tsnx-hosting-0.1.0-rc.1.tgz`
  - `tsnx-build-0.1.0-rc.1.tgz`
  - `tsnx-web-0.1.0-rc.1.tgz`
  - `tsnx-cli-0.1.0-rc.1.tgz`
- Menginstal tarball ke direktori isolated di luar monorepo (`os.tmpdir()`), lalu menguji:
  - `tsnx create console MyApp`
  - `tsnx create library MyLib`
  - `tsnx create webapi MyApi`
  - `tsnx build`
  - `tsnx test`
  - `tsnx run`
- Memastikan tidak ada ketergantungan tersembunyi ke path internal monorepo (`workspace:*` tergantikan oleh versi paket yang terdistribusi).

### 3. Cross-Platform & Release Automation
- Menyediakan GitHub Actions workflow (`.github/workflows/ci.yml`) untuk memvalidasi build dan test di matrix platform:
  - `ubuntu-latest`
  - `windows-latest`
  - `macos-latest`
- Menyediakan workflow rilis (`.github/workflows/release.yml`) untuk memverifikasi publishability ke npm (`pnpm publish --tag rc --dry-run`).

## Consequences
- TSNX siap dirilis sebagai `v0.1.0-rc.1` di bawah dist-tag `rc`, memungkinkan validasi aman dari pengguna eksternal sebelum promosi ke `latest`.
