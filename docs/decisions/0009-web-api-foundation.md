# ADR 0009: TSDK Web API Foundation (@tsdk/web)

## Status
Accepted

## Context
Setelah `@tsdk/hosting` selesai dengan fondasi Application Host, Dependency Injection (singleton, scoped, transient), Configuration, Logging, Hosted Services, dan deterministik Lifecycle, TSDK membutuhkan SDK layer resmi untuk membangun aplikasi Web API.

Sebelumnya belum ada HTTP abstraction resmi di TSDK; developer harus mengintegrasikan pustaka pihak ketiga secara manual tanpa integrasi native ke lifecycle dan DI hosting.

Tujuan paket `@tsdk/web` adalah menyediakan Web API Foundation murni yang dibangun langsung di atas `@tsdk/hosting` dan runtime bawaan `node:http`, tanpa memperkenalkan ketergantungan berlebih (menunda controllers/decorators, validation framework, authentication, ORM, dan OpenAPI).

## Decisions & Refinements

Berdasarkan kesepakatan dan 5 poin refinement arsitektural:

### 1. Pemisahan Eksplisit Kontrak Middleware vs Route Handler
- **Middleware**:
  ```typescript
  export type RequestDelegate = (ctx: HttpContext) => Promise<void>;
  export type Middleware = (ctx: HttpContext, next: RequestDelegate) => Promise<void>;
  ```
- **Route Handler**:
  ```typescript
  export interface HttpResult {
    executeAsync(ctx: HttpContext): Promise<void>;
  }
  export type RouteHandler = (ctx: HttpContext) => HttpResult | Promise<HttpResult>;
  ```
  Route Handler tidak memanipulasi low-level `ServerResponse` secara langsung melainkan mengembalikan `HttpResult` (seperti `Results.json(...)`, `Results.text(...)`, `Results.noContent(...)`). Framework mengeksekusi `HttpResult.executeAsync(ctx)` untuk menulis response secara terstruktur.

### 2. Middleware Onion Protection: Single `next()` Guard
- Middleware pipeline melindungi dari pemanggilan `next()` ganda. Jika `next()` dipanggil lebih dari 1 kali dalam middleware yang sama, framework melempar `InvalidOperationError('next() already called')` untuk mencegah eksekusi ganda pada downstream handlers atau database mutations.

### 3. Lifecycle Request & Client Abort Handling
- Setiap request yang masuk dibungkus dalam `HttpContext`.
- `ctx.request.signal` menyediakan `AbortSignal` yang terpicu saat koneksi client terputus prematur (`req.on('close')` sebelum response selesai).
- Request-scoped DI (`serviceProvider.createScope()`) ditempelkan pada `ctx.services`.
- Pembersihan resource (`await scope.dispose()`) dijalankan di blok `finally` setelah seluruh pipeline selesai mengeksekusi atau selesai menangani abort, bukan memotong/dispose scope seketika saat client terputus sementara handler masih berjalan.

### 4. Deterministik HTTP Routing Rules
Routing mendukung URL pattern statis dan named parameter (`:param`).
- **404 Not Found**: Jika path tidak cocok dengan pattern terdaftar.
- **405 Method Not Allowed + Allow header**: Jika path cocok dengan pattern, tetapi method HTTP tidak terdaftar.
- **400 Bad Request**: Jika terdapat malformed URL encoding pada path parameter.
- **Safe URL Decoding**: Parameter otomatis di-decode (`decodeURIComponent`).
- **Prioritas Routing**: Route statis memiliki prioritas lebih tinggi daripada parameter route jika ada collision pattern.
- **Duplicate Registration Check**: Pendaftaran pattern + method yang identik melempar error saat registrasi router.

### 5. Response & Error Handling yang Aman (Response-State Aware)
- Error boundary terpusat menangani exception unhandled.
- Sebelum mencoba mengirim response error (e.g. 500 JSON), framework memeriksa `ctx.response.hasStarted` / `res.headersSent`. Jika headers atau chunk response sudah mulai terkirim, error hanya dicatat ke logger dan stream ditutup tanpa mencoba menulis status/header baru yang akan memicu runtime crash `ERR_HTTP_HEADERS_SENT`.
- Request body reader (`ctx.request.readJson()`, `ctx.request.readText()`) memiliki ukuran maksimum configurable (`maxBodySizeBytes`, default 1MB). Jika body melebihi batas, request diputus dengan 413 Payload Too Large.

### 6. Filosofi HTTP Transport & Kepatuhan Protokol (HTTP Correctness)
- **Engine**: Menggunakan `node:http` sebagai transport resmi v1. TSDK mengadopsi filosofi:
  > *"Own the application model, reuse the platform primitives, and introduce dependencies only when they provide measurable value."*
- **Kepatuhan Protokol RFC**:
  - **HEAD requests**: Otomatis fallback ke route GET jika tidak didefinisikan secara khusus, mengirimkan response headers dan `Content-Length` yang valid tanpa menuliskan body bytes ke socket.
  - **OPTIONS requests**: Otomatis mengembalikan status `204 No Content` dan header `Allow` berisi daftar method yang diizinkan untuk path tersebut (termasuk `HEAD` dan `OPTIONS`).
  - **204 No Content / 304 Not Modified**: Sesuai RFC, framework secara otomatis menghapus header `Content-Length` & `Content-Type` serta tidak mengirimkan body.
  - **Streaming & Backpressure**: Tersedia `Results.stream()` berbasis `pipeline` Node.js streams dan `ctx.request.signal` untuk penanganan backpressure memori dan pembersihan stream saat client disconnect.

### 7. Integrasi Hosting & Graceful Shutdown
- Server HTTP diimplementasikan sebagai `HttpServerHostedService` yang mengimplementasikan `HostedService` dari `@tsdk/hosting`.
- Saat host `start()`: `server.listen(port, host)` dipanggil.
- Saat host `stop()`: Server menutup penerimaan socket baru (`server.close()`), melacak koneksi aktif, melakukan draining secara tertib, dan dijamin oleh bounded shutdown wait yang disediakan oleh lifecycle host.

## Consequences
- `@tsdk/web` menjadi fondasi HTTP modular, bersih, dan konsisten dengan runtime hosting TSDK.
- Menghindari refactor besar di masa depan saat kita menambahkan controller atau OpenAPI, karena kontrak handler, middleware, HTTP correctness, dan request scope sudah terisolasi dan deterministik.
