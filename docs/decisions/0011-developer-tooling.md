# ADR 0011: TSDK Developer Tooling (`watch`, `test`, and Unified Diagnostics)

## Status
Accepted

## Context
Setelah runtime Web API (`@tsdk/web`) terintegrasi penuh ke dalam siklus CLI (`create`, `build`, `run`), developer memerlukan *developer tooling* yang cepat dan andal untuk pekerjaan sehari-hari:
1. `tsdk watch`: Memantau perubahan source & manifest, kompilasi inkremental, dan restart aplikasi dengan graceful shutdown.
2. `tsdk test`: Eksekusi pengujian unit/integrasi secara terpadu melalui project dependency graph.
3. Unified Diagnostics: Format pesan error yang konsisten tanpa merusak identitas error compiler asli.

Tooling ini harus tetap berpegang teguh pada prinsip arsitektur:
> *`tsdk watch` dan `tsdk test` harus menggunakan build pipeline dan dependency graph yang sudah ada di `@tsdk/build` dan `@tsdk/core`, tanpa menciptakan compiler atau graph kedua.*

## Decisions & Refinements

### 1. Serialized Build Queue pada `tsdk watch`
- Menggunakan pola **Single-Flight Build + Dirty Flag**:
  - Hanya satu proses build yang dapat berjalan pada satu waktu (`isBuilding = true`).
  - Event perubahan file yang terjadi selama build berlangsung menandai `dirty = true`.
  - Ketika proses build selesai dan `dirty === true`, build baru langsung dijadwalkan ulang secara otomatis.
  - Restart aplikasi hanya dilakukan dari hasil kompilasi sukses yang paling mutakhir.

### 2. Kebijakan Child Process saat Build Gagal
- Jika build gagal: child process yang sedang berjalan **dihentikan secara graceful** (mencegah developer menguji binary basi/outdated yang disangka sudah memuat perubahan terbaru).
- Watcher tetap aktif menunggu developer memperbaiki kode.
- Aplikasi baru akan di-spawn kembali saat build berikutnya sukses.

### 3. File Discovery Eksplisit pada `tsdk test`
- Tidak mengandalkan shell glob `**/*` yang rawan masalah portabilitas lintas platform (Windows CMD vs PowerShell vs Bash).
- CLI melakukan traversing rekursif pada direktori `dist/` untuk mengumpulkan file test (`*.test.js`, `*.spec.js`).
- Path file test diberikan secara eksplisit ke Node.js test runner (`node --test <files...>`).
- Scope:
  - `tsdk test` di folder project: menguji project tersebut beserta referensinya.
  - `tsdk test --workspace`: menguji seluruh project dalam workspace secara berurutan sesuai topological sort.
  - Jika tidak ada berkas test ditemukan, sistem menampilkan peringatan eksplisit (bukan sukses diam-diam).

### 4. Unified Diagnostics tanpa Mengubah Kode TypeScript Asli
- **Diagnostic Format**:
  - `TSDK1xxx`: Manifest & Schema errors (misal `TSDK1001: Invalid .tsproj schema`).
  - `TSDK2xxx`: Reference Enforcement errors (misal `TSDK2101: Undeclared project reference`, `TSDK2102: Cross-project relative import forbidden`).
  - `TSDK4xxx`: Runtime / Lifecycle structured errors (misal `TSDK4001: CaptiveDependencyError`).
- **Compiler Errors Preserved**: Error asli `tsc` (seperti `TS2307`, `TS2304`) **tetap dipertahankan** identitas aslinya (`error TSxxxx`) dan tidak dimanipulasi atau di-remap ke kode TSDK. Formatter hanya menstandarkan visual layout (file, line:col, severity, code, message).

### 5. Reactive Manifest Watching & Dynamic Graph Updates
- Watcher memantau `src/` serta manifest `.tsproj`, `.tswork`, dan `package.json`.
- Jika terjadi perubahan manifest, watcher menandai flag `manifestDirty = true`.
- Sebelum kompilasi berikutnya, TSDK melakukan rediscovery dan reload project graph di `@tsdk/core` serta memperbarui daftar watch target direktori secara dinamis jika referensi project berubah.

## Consequences
- Pengalaman development harian menjadi mulus, terprediksi, dan deterministik.
- Tidak ada race condition kompilasi atau zombie process saat file diubah secara cepat.
