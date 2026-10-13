# @tsnx/web

High-performance HTTP Web API framework for TSNX, powered by Node.js native `node:http`.

## Features

- **Fluent WebApplication Builder**: Familiar builder API (`WebApplication.createBuilder()`) with integrated configuration and DI.
- **Onion Middleware Pipeline**: Middleware execution with single-flight `next()` guards.
- **Request-Scoped DI**: Every HTTP request receives an isolated DI scope, cleanly disposed after response completion.
- **RFC-Compliant HTTP Semantics**: Automatic `HEAD` and `OPTIONS` handling, 204/304 strip, `StreamResult` with Node.js `pipeline()` backpressure and cancellation.
- **Hardened Security**: Native header validation (`validateHeaderName`, `validateHeaderValue`), 413 request size limiting, and Slowloris timeout protection.

## Installation

```bash
npm install @tsnx/web @tsnx/hosting
```

## Quick Example

```typescript
import process from 'node:process';
import { WebApplication, Results } from '@tsnx/web';

const builder = WebApplication.createBuilder(process.argv.slice(2));
const app = builder.build();

app.mapGet('/', () => Results.json({ message: 'Hello from TSNX!' }));
app.mapGet('/health', () => Results.ok({ status: 'healthy' }));

await app.run();
```

## License

MIT
