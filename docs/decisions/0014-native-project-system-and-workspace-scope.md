# ADR 0014: Native TypeScript Project System & Workspace Scope Architecture

## Status
Accepted (RFC)

## Context
Pada fase awal pengembangan TSNX (v0.1 – v0.2.x), TSNX mengadopsi manifest kustom (`.tswork` dan `.tsproj`) untuk meniru model berkas `.sln` dan `.csproj` dari ekosistem .NET.

Meskipun model ini membuktikan kekuatan konsep abstraksi deklaratif, pengujian pada skenario dunia nyata (IDE VS Code, TSServer, dan package manager pnpm) menyingkap friksi arsitektur yang fundamental:
1. **Friksi Tooling & IDE**: Ekosistem TypeScript (VS Code, WebStorm, Neovim, ESLint, Prettier) secara bawaan dirancang di atas `tsconfig.json` dan `package.json`. Memperkenalkan ekstensi file kustom memaksa TSNX membangun jembatan (bridge), generator file sementara, hingga plugin language server hanya agar editor dapat mengenali tipe data dasar (seperti `node:crypto`).
2. **Esensi Developer Experience**: Keunggulan .NET yang sesungguhnya bukan terletak pada format XML berkasnya, melainkan pada **ergonomi alur kerjanya**: CLI terpadu (`dotnet new`, `dotnet build`, `dotnet run`), model hosting terstandar (`WebApplication`), dan sistem dependency injection yang first-class.
3. **Konvergensi Identitas Monorepo**: Proyek monorepo TypeScript modern membutuhkan pemisahan yang jelas antara **Project Identity** (identitas solusi untuk CLI) dan **Package Identity** (identitas scoped npm untuk resolusi modul saat runtime).

Dokumen ini mendefinisikan perubahan paradigma arsitektur TSNX: **mengadopsi primitives native TypeScript (`tsconfig.json` Project References + `package.json` Workspaces) sebagai *single source of truth*, serta memperkenalkan arsitektur automatic package scope derivation.**

---

## Architectural Decisions

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            TSNX CLI / SDK                                │
│   tsnx init · tsnx create · tsnx build · tsnx run · tsnx ref add         │
└─────────────────────┬──────────────────────────────┬─────────────────────┘
                      │                              │
        ┌─────────────▼─────────────┐  ┌─────────────▼─────────────┐
        │       tsconfig.json       │  │       package.json        │
        │ - Solution References     │  │ - Package Identity Scope  │
        │ - Composite Projects      │  │ - Runtime Dependencies    │
        │ - Compiler Strictness     │  │ - Workload Spec (tsnx.*)  │
        └─────────────┬─────────────┘  └─────────────┬─────────────┘
                      │                              │
        ┌─────────────▼──────────────────────────────▼─────────────┐
        │            Native TypeScript & Node.js Ecosystem         │
        │ - Out-of-the-box IDE support (VS Code, WebStorm, Zed)    │
        │ - Native tsc -b compilation engine                       │
        │ - Native pnpm/npm workspace linking & resolution         │
        └──────────────────────────────────────────────────────────┘
```

---

### 1. Fondasi Native: TypeScript Project References

#### A. Solution Root (`tsconfig.json`)
Root workspace menggunakan format native solution configuration:
```json
{
  "files": [],
  "references": [
    { "path": "./apps/ArasERP.Host" },
    { "path": "./packages/Domain" },
    { "path": "./packages/Infrastructure" }
  ]
}
```
Peran: Mengarahkan `tsc -b` untuk membangun seluruh dependency graph workspace secara topologis.

#### B. Project Configuration (`<project>/tsconfig.json`)
Setiap project mendeklarasikan batasan kompilasinya sendiri:
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/Domain" }
  ]
}
```

---

### 2. Pemisahan Tanggung Jawab & Larangan Polusi `tsconfig.json`

Untuk menjamin kepatuhan penuh terhadap skema resmi TypeScript dan menghindari diagnostic editor:
- **`tsconfig.json`** murni berisi konfigurasi compiler dan referensi direktori. Properti nonstandar (seperti top-level `"tsnx"`) dilarang.
- **`package.json`** menyimpan identitas paket, entry point, dependensi runtime, serta metadata workload TSNX melalui namespace resmi:
  ```json
  {
    "name": "@araserp/host",
    "version": "0.1.0",
    "type": "module",
    "main": "./dist/main.js",
    "types": "./dist/main.d.ts",
    "tsnx": {
      "type": "webapi"
    }
  }
  ```

---

### 3. Pemisahan Project Identity vs. Package Identity

TSNX membedakan secara tegas dua konsep identitas:

| Dimensi | Project Identity (TSNX) | Package Identity (npm / Node.js) |
|---|---|---|
| **Format** | PascalCase (`ArasERP.Domain`, `ArasERP.Host`) | Lowercase Scoped (`@araserp/domain`, `@araserp/host`) |
| **Konsumen** | TSNX CLI (`tsnx run -p ArasERP.Host`) | Node.js Module Resolution & Import TypeScript |
| **Sintaks Kode** | N/A | `import { Employee } from "@araserp/domain";` |

#### De-stuttering Otomatis
Generator TSNX secara otomatis memotong prefix nama workspace agar tidak menghasilkan nama paket yang redundan:
- Workspace: `ArasERP`
- Project: `ArasERP.Domain`
- ❌ **Hindari Stuttering**: `@araserp/araserp-domain`
- ✅ **Hasil Bersih**: `@araserp/domain`

---

### 4. Workspace Scope Derivation & Manajemen CLI

Saat membuat workspace baru, TSNX menurunkan npm scope secara cerdas:

```bash
# 1. Otomatis: Nama workspace ArasERP menghasilkan scope @araserp
tsnx init workspace -n ArasERP

# 2. Eksplisit: Menentukan scope custom
tsnx init workspace -n ArasERP --scope @aras

# 3. Tanpa Scope: Untuk monorepo privat tanpa scoped package
tsnx init workspace -n ArasERP --no-scope
```

#### Aturan Normalisasi & Validasi Scope
1. Default: `toKebabCase(workspaceName).replace(/^@?/, '@')`.
2. Validasi format npm scope via regex: `/^@[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/`.
3. Scope default disimpan di root `package.json`:
   ```json
   {
     "name": "araserp-workspace",
     "private": true,
     "tsnx": {
       "scope": "@araserp"
     }
   }
   ```

---

### 5. Otomatisasi Alur Kerja (Dual-Wiring Developer Experience)

Keunggulan utama TSNX adalah mengeliminasi kerepotan manual dalam menyinkronkan Project References:

#### A. Pembuatan Project (`tsnx create`)
```bash
tsnx create webapi -n ArasERP.Host -o apps/ArasERP.Host
tsnx create library -n ArasERP.Domain -o packages/Domain
```
TSNX secara atomik:
1. Men-generate `tsconfig.json` & `package.json` yang valid di folder target.
2. Mendaftarkan path project ke dalam array `references` pada root `tsconfig.json`.

#### B. Penyambungan Dependensi (`tsnx ref add`)
```bash
tsnx ref add ArasERP.Host --to ArasERP.Domain
```
TSNX melakukan **Dual-Wiring**:
1. Menambahkan `{ "path": "../../packages/Domain" }` ke `apps/ArasERP.Host/tsconfig.json`.
2. Menambahkan `"@araserp/domain": "workspace:*"` ke `apps/ArasERP.Host/package.json`.

#### C. Kompilasi & Eksekusi (`tsnx build` & `tsnx run`)
- `tsnx build` mengeksekusi `tsc -b` pada root `tsconfig.json` dengan boundary linting TSNX (TSNX2101 / TSNX2102).
- `tsnx run -p ArasERP.Host` mengompilasi dan mengeksekusi aplikasi host dengan engine hosting ASP.NET Core (`WebApplication`).

---

## Migration & Implementation Plan

Untuk menjaga stabilitas rilis saat ini (v0.2.x):
1. **Fase 1 (Design & RFC)**: Kunci ADR 0014 sebagai cetak biru arsitektur v0.3.0.
2. **Fase 2 (Dual-Engine Reader)**: Buat `@tsnx/core` mampu membaca proyek berbasis native `tsconfig.json` + `package.json` tanpa merusak dukungan legacy `.tswork` / `.tsproj`.
3. **Fase 3 (CLI Scaffolding Update)**: Perbarui `tsnx init workspace` dan `tsnx create` untuk memproduksi format native secara default dengan scope derivation.
4. **Fase 4 (Migration Command)**: Sediakan perintah `tsnx migrate` untuk mengonversi repositori `.tswork` ke `tsconfig.json` references secara otomatis.
5. **Fase 5 (Deprecation)**: Hapus parser berkas kustom dan jembatan konfigurasi temporer.

---

## Consequences

### Positif
- **Zero-Friction IDE**: Semua editor (VS Code, WebStorm, Neovim, Zed, Cursor) bekerja 100% out-of-the-box tanpa perlu plugin bahasa kustom.
- **Ekosistem Standar**: Kompatibilitas penuh dengan ESLint, Prettier, vitest, pnpm, npm, dan bun.
- **Nama Package Bersih**: Kode impor aplikasi ringkas (`import { User } from "@araserp/domain"`).
- **Maintenance Ringan**: Menghapus ratusan baris kode generator jembatan konfigurasi yang rumit.

### Negatif / Perhatian
- TypeScript Project References memerlukan disiplin `composite: true` dan emisi declaration `.d.ts` yang konsisten (namun hal ini telah sepenuhnya diotomatisasi oleh template TSNX).
