# ADR 0010: Web API Developer Experience & Tooling Integration

## Status
Accepted

## Context
Setelah `@tsdk/web` stabil dengan HTTP abstraction, routing deterministik, middleware onion pipeline, request-scoped DI, graceful shutdown, serta kepatuhan semantik HTTP (HEAD, OPTIONS, 204/304, Streaming), tahap berikutnya adalah menghubungkan `@tsdk/web` ke developer tooling TSDK yang sudah ada (`@tsdk/core`, `@tsdk/build`, dan `@tsdk/cli`).

Sebelumnya, developer hanya bisa membuat project bertipe `console` dan `library` lewat `tsdk create`. Pembuatan aplikasi Web API masih memerlukan penulisan manifest dan boilerplate manual.

## Decisions

### 1. Project Manifest `spec.type: webapi`
- `.tsproj` secara native mendukung `spec.type: webapi`.
- Manifest default untuk project Web API:
  ```yaml
  schemaVersion: 1
  kind: Project

  metadata:
    name: MyApp
    version: 0.1.0

  spec:
    type: webapi
    runtime: node

    source:
      root: src
      entry: src/main.ts

    compiler:
      target: ES2022
      module: NodeNext
      strict: true
  ```

### 2. Scaffolding `tsdk create webapi <Name>`
- Ditambahkan template `webapi` pada CLI scaffolder (`apps/cli`).
- Menghasilkan:
  - `<Name>.tsproj` dengan `spec.type: webapi`.
  - `package.json` yang secara otomatis menyertakan `"@tsdk/web": "workspace:*"`.
  - `src/main.ts` dengan boilerplate resmi menggunakan `WebApplication`:
    ```typescript
    import process from 'node:process';
    import { WebApplication, Results } from '@tsdk/web';

    const builder = WebApplication.createBuilder(process.argv.slice(2));
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    builder.configureServer({ port, host: '0.0.0.0' });

    const app = builder.build();

    app.mapGet('/', () => Results.json({ message: 'Welcome to MyApp API!' }));
    app.mapGet('/health', () => Results.json({ status: 'ok', timestamp: new Date().toISOString() }));

    await app.run();
    ```

### 3. Eksekusi via `tsdk run` & Lifecycle Forwarding
- `tsdk run` secara otomatis mengompilasi project Web API (`dist/main.js`) dan mengeksekusinya via Node.js runtime.
- CLI meneruskan sinyal terminasi OS (`SIGINT`, `SIGTERM`) ke child process yang menjalankan aplikasi, sehingga lifecycle coordinator di `@tsdk/hosting` / `@tsdk/web` dapat menjalankan graceful shutdown dan connection draining secara deterministik.

### 4. Zero New Compiler Pipelines
- Web API menggunakan pipeline compiler yang sama persis dengan `console` dan `library` di `@tsdk/build`. Tidak ada compiler khusus atau langkah translasi tambahan.

## Consequences
- Siklus hidup lengkap Web API (Create $\to$ Build $\to$ Run $\to$ HTTP Request $\to$ Graceful Shutdown) kini terintegrasi penuh ke dalam antarmuka resmi CLI tanpa konfigurasi manual.
