# @tsnx/openapi

TSNX OpenAPI 3.1 Document Generation via Static Endpoint Introspection.

## Features

- **Static Endpoint Introspection**: Generates complete OpenAPI 3.1 specifications directly from route handler metadata without executing handlers.
- **Rich Schema Conversion**: Converts primitives, objects, arrays, and schema validators into standard OpenAPI schema objects.
- **Built-in Route Handler**: Direct integration with `app.mapOpenApi('/openapi/v1.json')`.

## Installation

```bash
npm install @tsnx/openapi @tsnx/web
```

## Quick Example

```typescript
import { WebApplication } from '@tsnx/web';
import '@tsnx/openapi';

const builder = WebApplication.createBuilder();
builder.addOpenApi();
const app = builder.build();

app.mapGet('/items', () => ({ items: [] }))
  .withName('GetItems')
  .withSummary('Retrieve all items');

app.mapOpenApi('/openapi/v1.json');

await app.run();
```

## License

MIT
