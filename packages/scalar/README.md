# @tsnx/scalar

Interactive API Reference UI via Scalar for TSNX.

## Features

- **Embedded Interactive UI**: Render beautiful API documentation reference powered by Scalar.
- **OpenAPI Integration**: Works directly with endpoints configured via `@tsnx/openapi`.
- **Zero Config Setup**: Route mapping via `app.mapScalarApiReference()`.

## Installation

```bash
npm install @tsnx/scalar @tsnx/openapi @tsnx/web
```

## Quick Example

```typescript
import { WebApplication } from '@tsnx/web';
import '@tsnx/openapi';
import '@tsnx/scalar';

const builder = WebApplication.createBuilder();
builder.addOpenApi();
const app = builder.build();

app.mapOpenApi('/openapi/v1.json');
app.mapScalarApiReference('/scalar/v1');

await app.run();
```

## License

MIT
