# ADR 0007: Extension Rename (.tsp -> .tsproj, .tsw -> .tswork)

## Status
Accepted

## Context
Untuk meningkatkan kejelasan identitas file manifest dalam ekosistem TSDK, diputuskan bahwa:
- `.tsp` (TypeScript Project) diubah menjadi `.tsproj`.
- `.tsw` (TypeScript Workspace) diubah menjadi `.tswork`.

Perubahan ini murni pada level ekstensi file, bukan perubahan arsitektur:
- Format file tetap YAML.
- Schema manifest (schemaVersion 1, kind: Project / Workspace, metadata, spec, references) tetap identik.
- Workspace tetap opsional (single-project standalone tetap didukung).
- Project references tetap berbasis nama (`spec.references: [{ project: string }]`) dan eksplisit.

## Decisions

### 1. Core Parser Error Messages
- `ProjectValidationError` dan `WorkspaceValidationError` memperbarui pesan error yang mereferensikan root mapping ke `.tsproj` dan `.tswork`.

### 2. Discovery Engine (`@tsdk/cli`)
- `findContext` memindai dan mencocokkan file `.tsproj` dan `.tswork`.
- Prioritas penelusuran (Smart Context Discovery) tetap tidak berubah: `.tsproj` terdekat memiliki preseden kecuali jika opsi `--workspace` diaktifkan.

### 3. Scaffolding & Execution
- `TemplateGenerator`: Menghasilkan `<name>.tsproj` saat membuat project baru (`console` atau `library`).
- `WorkspaceManager`: Menghasilkan `<name>.tswork` saat inisialisasi workspace, dan memvalidasi path `.tsproj` saat registrasi project.
- `tsdk ref add`: Memperbarui deklarasi referensi di `<name>.tsproj`.

### 4. Codebase Migration & Fixtures
- Semua sampel di `samples/Acme/` dipindahkan ke `Acme.tswork`, `Acme.Api.tsproj`, dan `Acme.Domain.tsproj`.
- Seluruh 39 unit test dimigrasikan untuk menggunakan ekstensi `.tsproj` dan `.tswork`.
