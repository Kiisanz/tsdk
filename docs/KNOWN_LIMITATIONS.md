# Known Limitations & Differences from ASP.NET Core

TSNX membawa konsep Web API, hosting, dependency injection, and project system ala ASP.NET Core ke dalam ekosistem TypeScript dan Node.js. Karena karakteristik bahasa dan runtime, beberapa perbedaan perilaku berlaku secara sengaja dan didokumentasikan di bawah ini:

## 1. Type Erasure & Runtime Model Binding (Kelas A/B)
- **Karakteristik**: TypeScript menghapus tipe statis saat kompilasi (*type erasure*). Generic types dan interface tidak dapat diinspeksi saat runtime tanpa metadata runtime.
- **Perilaku TSNX**: Validasi dan model binding request body (`bindBody`), query (`bindQuery`), dan route (`bindRoute`) menggunakan runtime schema descriptors (`array()`, `nullable()`, `optional()`). Penggunaan `Infer<typeof Schema>` memberikan inferensi tipe statis rekursif yang sepenuhnya cocok dengan validasi runtime (*fail-closed*).

## 2. Cancellation: `AbortSignal` vs `CancellationToken` (Kelas B)
- **Karakteristik**: ASP.NET Core menggunakan `CancellationToken` dan `CancellationTokenSource`.
- **Perilaku TSNX**: TSNX menggunakan standar Web API `AbortSignal` dan `AbortController`. `AbortSignal` terpropagasi ke seluruh HTTP pipeline, endpoint filter, hosted services, dan I/O downstream. Signal otomatis dibatalkan saat client disconnect, timeout request (`RequestExecutionTimeoutMs`), atau shutdown aplikasi.

## 3. Threading Model & Event Loop (Kelas A)
- **Karakteristik**: ASP.NET Core berjalan di atas multi-threaded thread pool (Kestrel).
- **Perilaku TSNX**: TSNX berjalan pada single event loop Node.js non-blocking. Pekerjaan CPU-bound intensif (seperti enkripsi berat atau kompresi besar) disarankan didelegasikan ke Node.js Worker Threads agar tidak memblokir penanganan request lain.

## 4. DI Scope & HttpContext Isolation (Kelas B)
- **Karakteristik**: ASP.NET Core menggunakan thread-affinity dan `AsyncLocal<T>`.
- **Perilaku TSNX**: TSNX menggunakan `AsyncLocalStorage` dan parameter konteks eksplisit. Instance dengan lifetime `Scoped` dibuat per HTTP request dan di-dispose secara deterministik saat response stream berakhir atau koneksi diputus. Root container dilindungi dari captive dependency (`CaptiveDependencyError`).

## 5. Explicit Resource Management & Disposal Order (Kelas B)
- **Karakteristik**: ASP.NET Core mengimplementasikan `IDisposable` dan `IAsyncDisposable`.
- **Perilaku TSNX**: TSNX mendukung standar ES Explicit Resource Management (`[Symbol.asyncDispose]` dan `[Symbol.dispose]`) serta konvensi `dispose()`. Instance dibersihkan secara terurut terbalik (*reverse creation order*) di semua skenario (sukses, error, abort, dan timeout).

## 6. Project References & Assembly Scanning (Kelas B)
- **Karakteristik**: ASP.NET Core memindai `.dll` assemblies yang terkompilasi.
- **Perilaku TSNX**: TSNX menggunakan native TypeScript Project References (`tsconfig.json` references) dan manifest (`.tswork` / `.tsproj`) dengan DAG dependency graph terisolasi dan validasi siklus impor otomatis.
