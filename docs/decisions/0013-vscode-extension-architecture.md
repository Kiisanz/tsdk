# ADR 0013: VS Code Extension (`vscode-tsnx`) Architecture

## Status
Accepted

## Context
Framework TSNX menggantikan boilerplate konfigurasi TypeScript (`tsconfig.json`) dengan manifest yang deklaratif:
- `.tswork`: Workspace manifest (solusi monorepo, project references, tools).
- `.tsproj`: Project manifest (source boundaries, compiler targets, references, package specs).

Meskipun `tsnx build` (CLI) bekerja sempurna menggunakan `.tsnx/generated/tsconfig.json`, editor VS Code / IDE yang menggunakan built-in TypeScript Language Server (`tsserver`) memiliki keterbatasan struktural:
1. VS Code **hanya mendeteksi file bernama `tsconfig.json`** yang berada di dalam folder aktif atau parent folder-nya.
2. Ketika tidak ada `tsconfig.json` di root atau level project, VS Code memperlakukan file TypeScript sebagai *Inferred Project*, menyebabkan kegagalan resolusi tipe (misalnya error `ts(2591)` untuk modul built-in Node/crypto/process, dan kegagalan autocomplete antar-project reference).
3. Mewajibkan developer untuk membuat atau me-maintain `tsconfig.json` di root atau di tiap project bertentangan dengan filosofi "zero-tsconfig" TSNX.

Untuk menjembatani ekosistem IDE dengan filosofi TSNX, diperlukan ekstensi resmi Visual Studio Code: **`vscode-tsnx`**.

---

## Architectural Decisions

### 1. Dual-Tier IDE Integration
Ekstensi `vscode-tsnx` dirancang dengan arsitektur dua lapisan:

```
┌─────────────────────────────────────────────────────────────┐
│                       VS Code Window                        │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              vscode-tsnx Extension Host             │   │
│   │  - File Watcher (.tswork, .tsproj)                  │   │
│   │  - Transparent Ephemeral Bridge Generator           │   │
│   │  - Project Explorer TreeView (Apps, Packages, Deps) │   │
│   │  - Commands (Run, Build, Clean, Test)               │   │
│   │  - YAML Schema Provider for .tswork / .tsproj       │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │       Built-in TypeScript Service (tsserver)        │   │
│   │  - Consumes auto-bridged project references         │   │
│   │  - In-editor diagnostics, autocomplete, refactoring │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Lapisan A: TypeScript Server Plugin & Bridge Automation
- **Transparent Bridge Automation**:
  Saat ekstensi mendeteksi `.tswork` atau `.tsproj` di workspace:
  - Ekstensi secara instan dan reaktif (via `FileSystemWatcher`) men-generate `.tsnx/generated/*.tsconfig.json`.
  - Ekstensi memelihara file ephemeral `tsconfig.json` di root yang otomatis diabaikan oleh `.gitignore` (atau menyuntikkan compiler options langsung ke TSServer melalui plugin).
  - Hasil: Pengembang **tidak perlu lagi menulis atau mengelola `tsconfig.json` sama sekali**. Semua berjalan otomatis di balik layar.
- **Node & TypeRoots Injector**:
  - Menyediakan fallback `@types/node` otomatis baik dari workspace lokal, fallback global CLI, maupun bundled extension types, sehingga tidak ada lagi error `ts(2591)`.

#### Lapisan B: Developer Tooling & UI Integration
- **TSNX Project Explorer (Sidebar TreeView)**:
  - Menampilkan daftar semua aplikasi (`apps/`) dan pustaka (`packages/`) yang terdaftar dalam `.tswork`.
  - Menampilkan status dependensi antar-projek (dependency graph).
  - Tombol aksi cepat: *Run Application*, *Build Project*, *Build Workspace*, *Clean*.
- **Task & Debug Configuration Provider**:
  - Menyediakan *launch configuration* otomatis (`type: "tsnx"`) untuk debugging aplikasi TSNX (`tsnx run -p <name>`) dengan source-map terintegrasi dan terminal terkelola.

---

### 2. YAML Schema & Validation untuk `.tswork` dan `.tsproj`
Ekstensi menyertakan JSON Schema resmi untuk:
- `tsnx.workspace.schema.json` (memvalidasi format `.tswork`).
- `tsnx.project.schema.json` (memvalidasi format `.tsproj`).

Skema didaftarkan ke VS Code melalui kontribusi `yaml.schemas` (kompatibel dengan ekstensi Red Hat YAML) untuk memberikan:
- Auto-completion untuk properti: `type`, `target`, `module`, `references`, `compiler`, `package`.
- Validasi sintaks dan hover documentation langsung di editor.

---

### 3. Struktur Monorepo Package
Ekstensi ditempatkan di monorepo `tsdk` pada direktori:
```
tsdk/
├── packages/
│   ├── core/
│   ├── build/
│   ├── hosting/
│   ├── web/
│   └── vscode-extension/   # @tsnx/vscode (ekstensi VS Code)
└── apps/
    └── cli/
```

Ekstensi `@tsnx/vscode` mengonsumsi `@tsnx/core` dan `@tsnx/build` untuk memanfaatkan parser manifest dan config generator yang sudah ada tanpa menduplikasi logika.

---

## Consequences
- **Positive**:
  - Pengembang mendapatkan pengalaman "Zero tsconfig": cukup buat `.tswork` dan `.tsproj`.
  - Error `ts(2591)` dan red-squigglies di VS Code teratasi secara permanen dan otomatis.
  - Dokumentasi dan autocomplete untuk file manifest TSNX langsung tersedia di editor.
- **Negative / Maintenance**:
  - Memerlukan pemeliharaan paket ekstensi VS Code dan publikasi ke Visual Studio Code Marketplace dan Open VSX.
