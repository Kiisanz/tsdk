# @tsnx/mediator

Enterprise-grade Mediator and CQRS pattern implementation for TSNX, inspired by Jimmy Bogard's MediatR in .NET.

## Features

- **100% Native Scoped Dependency Injection**: Handlers and behaviors are resolved per request scope from `@tsnx/hosting`.
- **Pipeline Behaviors (Middleware)**: Intercept requests for validation, logging, timing, and transactions using an Onion Architecture (`await next()`).
- **Cancellation Token Support**: Native `AbortSignal` propagation through behaviors down to handlers.
- **Requests & Notifications**:
  - `send(request, ct)`: 1-to-1 dispatching for Commands & Queries.
  - `publish(notification, ct)`: 1-to-many broadcast for Domain Events.
- **Zero-Decorators & Zero `reflect-metadata`**: Clean, fast, and 100% compatible with NodeNext ESM.

## Installation

```bash
pnpm add @tsnx/mediator
```

## Quick Start

```typescript
import { WebApplication, Results, body, context } from '@tsnx/web';
import { IRequest, IRequestHandler, addMediator, IMediator } from '@tsnx/mediator';

// 1. Define Request & Response
export class CreateUserCommand implements IRequest<{ id: string }> {
  constructor(public readonly name: string) {}
}

// 2. Define Scoped Handler
export class CreateUserHandler implements IRequestHandler<CreateUserCommand, { id: string }> {
  constructor(private readonly db: AppDbContext) {}

  async handle(command: CreateUserCommand, ct?: AbortSignal) {
    // Business logic
    return { id: 'usr_123' };
  }
}

// 3. Register in DI
const builder = WebApplication.createBuilder();

addMediator(builder.services, (options) => {
  options.register(CreateUserCommand, CreateUserHandler);
});

// 4. Dispatch from Minimal API
const app = builder.build();

app.mapPost('/users', [body(UserSchema), context()], async (input, ctx) => {
  const mediator = ctx.services.get(IMediator);
  const result = await mediator.send(
    new CreateUserCommand(input.name),
    ctx.request.signal
  );
  return Results.created(result);
});

await app.run();
```

## Pipeline Behaviors

```typescript
import { IPipelineBehavior, RequestHandlerDelegate } from '@tsnx/mediator';

export class LoggingBehavior implements IPipelineBehavior {
  async handle(request: any, next: RequestHandlerDelegate<any>, ct?: AbortSignal) {
    console.log('[START]', request);
    const result = await next();
    console.log('[END]', result);
    return result;
  }
}

// Register behavior:
addMediator(builder.services, (options) => {
  options.addBehavior(LoggingBehavior);
});
```
