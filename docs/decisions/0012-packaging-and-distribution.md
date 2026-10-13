# ADR 0012: TSDK Packaging, Distribution & Release Engineering

## Status
Accepted

## Context
Setelah seluruh fondasi framework dan tooling development TSDK (`@tsdk/core`, `@tsdk/hosting`, `@tsdk/build`, `@tsdk/web`, dan `@tsdk/cli`) selesai dan diverifikasi pada 82 unit/integration test, fokus TSDK beralih ke **Packaging, Distribution, dan Release Engineering**.

Tujuan utama fase ini adalah membuktikan bahwa:
1. Setiap package publik TSDK memiliki metadata kemasan (`package.json`) yang lengkap dan valid: `files`, `exports`, `main`, `types`, `bin`, lisensi, dan dependensi terisolasi.
2. Developer di luar lingkungan monorepo TSDK dapat menginstal paket TSDK (melalui `npm pack` tarball / npm registry) dan langsung menjalankan alur kerja penuh: `tsdk create` $\to$ `tsdk restore` $\to$ `tsdk build` $\to$ `tsdk run` $\to$ `tsdk test` tanpa memerlukan akses ke source repository TSDK.
3. Alur rilis versi terkoordinasi (Unified Semantic Versioning) dan pipeline otomatisasi rilis siap dijalankan untuk rilis perdana **v0.1.0-rc.1** (Release Candidate) dengan dist-tag `--tag rc`.

## Decisions

### 1. Standar Package Integrity & Manifest Publik
Setiap package yang dipublikasikan (`@tsdk/core`, `@tsdk/hosting`, `@tsdk/build`, `@tsdk/web`, `@tsdk/cli`) harus memenuhi standar:
- **`files` whitelist**: Hanya menyertakan folder `dist` dan `README.md` (mengecualikan `src`, test fixtures, dan konfigurasi lokal).
- **`exports` map**: Menyediakan subpath exports eksplisit dengan pemetaan `types` dan `import`.
- **`engines`**: Mendeklarasikan dukungan minimal Node.js (`>= 18.0.0`).
- **`license`**: `MIT`.
- **Executable binary**: `@tsdk/cli` mendeklarasikan `"bin": { "tsdk": "./dist/index.js" }` dengan shebang `#!/usr/bin/env node`.

### 2. Isolated Consumer Verification
- Menguji distribusi paket dengan membuat tarball (`npm pack` / `pnpm pack`) untuk setiap paket:
  - `tsdk-core-0.1.0-rc.1.tgz`
  - `tsdk-hosting-0.1.0-rc.1.tgz`
  - `tsdk-build-0.1.0-rc.1.tgz`
  - `tsdk-web-0.1.0-rc.1.tgz`
  - `tsdk-cli-0.1.0-rc.1.tgz`
- Menginstal tarball ke direktori isolated di luar monorepo (`os.tmpdir()`), lalu menguji:
  - `tsdk create console MyApp`
  - `tsdk create library MyLib`
  - `tsdk create webapi MyApi`
  - `tsdk build`
  - `tsdk test`
  - `tsdk run`
- Memastikan tidak ada ketergantungan tersembunyi ke path internal monorepo (`workspace:*` tergantikan oleh versi paket yang terdistribusi).

### 3. Cross-Platform & Release Automation
- Menyediakan GitHub Actions workflow (`.github/workflows/ci.yml`) untuk memvalidasi build dan test di matrix platform:
  - `ubuntu-latest`
  - `windows-latest`
  - `macos-latest`
- Menyediakan script / workflow rilis untuk memverifikasi publishability ke npm (`pnpm publish --tag rc --dry-run`).

## Consequences
- TSDK siap dirilis sebagai `v0.1.0-rc.1` di bawah dist-tag `rc`, memungkinkan validasi aman dari pengguna eksternal sebelum promosi ke `latest`.
