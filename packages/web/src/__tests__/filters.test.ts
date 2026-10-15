import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  WebApplication,
  Results,
  IEndpointFilter,
  EndpointFilterInvocationContext,
  EndpointFilterDelegate,
  body,
  service,
  query,
  route,
  header,
  context,
  createToken,
  optional,
  array,
} from '../index.js';

describe('Endpoint Filters and Declarative Descriptors', () => {
  let app: WebApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = undefined;
    }
  });

  test('Class-based IEndpointFilter executes around endpoint and adds headers', async () => {
    class CustomHeaderFilter implements IEndpointFilter {
      public async invokeAsync(
        ctx: EndpointFilterInvocationContext,
        next: EndpointFilterDelegate,
      ) {
        ctx.httpContext.response.setHeader('X-Custom-Filter', 'executed');
        const res = await next(ctx);
        ctx.httpContext.response.setHeader('X-After-Filter', 'finished');
        return res;
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/filtered', () => Results.text('Filtered endpoint!'))
      .addEndpointFilter(CustomHeaderFilter);

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/filtered`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'Filtered endpoint!');
    assert.strictEqual(res.headers.get('x-custom-filter'), 'executed');
    assert.strictEqual(res.headers.get('x-after-filter'), 'finished');
  });

  test('Scoped DI resolution in IEndpointFilter constructor', async () => {
    class AuditService {
      public actions: string[] = [];
      public record(action: string) {
        this.actions.push(action);
      }
    }

    class AuditFilter implements IEndpointFilter {
      constructor(private readonly audit: AuditService) {}

      public async invokeAsync(
        ctx: EndpointFilterInvocationContext,
        next: EndpointFilterDelegate,
      ) {
        this.audit.record(`before:${ctx.httpContext.request.path}`);
        const result = await next(ctx);
        this.audit.record(`after:${ctx.httpContext.request.path}`);
        return result;
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addScoped(AuditService, () => new AuditService());
    builder.services.addScoped(AuditFilter, (sp) => new AuditFilter(sp.get(AuditService)));
    app = builder.build();

    let recordedActions: string[] = [];

    app.mapGet('/audited', (ctx) => {
      const audit = ctx.services.get(AuditService);
      recordedActions = audit.actions;
      return Results.json({ actionsSoFar: audit.actions.length });
    }).addEndpointFilter(AuditFilter);

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/audited`);
    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.actionsSoFar, 1);
    assert.deepStrictEqual(recordedActions, ['before:/audited', 'after:/audited']);
  });

  test('Class filter with constructor dependencies fails fast when not registered in DI', async () => {
    class UnregisteredService {}

    class DependentFilter implements IEndpointFilter {
      // Has 1 constructor dependency but is NOT registered in DI
      constructor(public readonly dep: UnregisteredService) {}

      public async invokeAsync(
        ctx: EndpointFilterInvocationContext,
        next: EndpointFilterDelegate,
      ) {
        return await next(ctx);
      }
    }

    const builder = WebApplication.createBuilder(['--Environment=Development']);
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/missing-di', () => Results.text('ok'))
      .addEndpointFilter(DependentFilter);

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/missing-di`);
    assert.strictEqual(res.status, 500);
    const problem = await res.json() as any;
    assert.strictEqual(problem.status, 500);
    assert.ok(problem.detail?.includes("Endpoint filter 'DependentFilter' has constructor dependencies"));
  });

  test('Filter short-circuits request by returning HttpResult without calling next', async () => {
    let handlerInvoked = false;

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    // Inline auth filter that short circuits if missing Authorization header
    app.mapGet('/protected', () => {
      handlerInvoked = true;
      return Results.text('Protected Secret Data');
    }).addEndpointFilter(async (ctx, next) => {
      const auth = ctx.httpContext.request.headers['authorization'];
      if (!auth || auth !== 'Bearer valid-token') {
        return Results.problem({
          status: 401,
          title: 'Unauthorized',
          detail: 'Missing or invalid token.',
        });
      }
      return await next(ctx);
    });

    await app.start();
    const port = app.listeningPort;

    // 1. Missing header -> 401 problem details, handler not reached
    const resUnauthorized = await fetch(`http://127.0.0.1:${port}/protected`);
    assert.strictEqual(resUnauthorized.status, 401);
    assert.strictEqual(handlerInvoked, false);
    const problem = await resUnauthorized.json() as any;
    assert.strictEqual(problem.title, 'Unauthorized');
    assert.strictEqual(problem.detail, 'Missing or invalid token.');

    // 2. Valid token -> 200 OK, handler reached
    const resOk = await fetch(`http://127.0.0.1:${port}/protected`, {
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.strictEqual(resOk.status, 200);
    assert.strictEqual(await resOk.text(), 'Protected Secret Data');
    assert.strictEqual(handlerInvoked, true);
  });

  test('Multiple filters execute in FIFO onion order and guard against multiple next() calls', async () => {
    const executionOrder: string[] = [];

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/onion', () => {
      executionOrder.push('handler');
      return Results.text('onion ok');
    })
      .addEndpointFilter(async (ctx, next) => {
        executionOrder.push('filter1:enter');
        const res = await next(ctx);
        executionOrder.push('filter1:exit');
        return res;
      })
      .addEndpointFilter(async (ctx, next) => {
        executionOrder.push('filter2:enter');
        const res = await next(ctx);
        executionOrder.push('filter2:exit');
        return res;
      });

    // Endpoint testing multiple next() calls error guard
    app.mapGet('/double-next', () => Results.text('ok'))
      .addEndpointFilter(async (ctx, next) => {
        await next(ctx);
        await next(ctx); // Should throw Invalid operation error
      });

    await app.start();
    const port = app.listeningPort;

    // 1. Verify onion execution order
    const resOnion = await fetch(`http://127.0.0.1:${port}/onion`);
    assert.strictEqual(resOnion.status, 200);
    assert.deepStrictEqual(executionOrder, [
      'filter1:enter',
      'filter2:enter',
      'handler',
      'filter2:exit',
      'filter1:exit',
    ]);

    // 2. Verify multiple next() calls throw error caught by ExceptionHandler
    const resDouble = await fetch(`http://127.0.0.1:${port}/double-next`);
    assert.strictEqual(resDouble.status, 500);
    const errProblem = await resDouble.json() as any;
    assert.strictEqual(errProblem.status, 500);
  });

  test('getArgument<T>() bounds check throws RangeError on invalid index', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/bounds-check', () => Results.ok())
      .addEndpointFilter(async (ctx, next) => {
        // V1 has 1 argument: [httpContext]
        assert.ok(ctx.getArgument(0)); // Valid
        assert.throws(() => ctx.getArgument(-1), RangeError);
        assert.throws(() => ctx.getArgument(1), RangeError);
        assert.throws(() => ctx.getArgument(99), RangeError);
        assert.throws(() => ctx.getArgument(1.5), RangeError);
        return await next(ctx);
      });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/bounds-check`);
    assert.strictEqual(res.status, 200);
  });

  test('Filter can mutate arguments in place before passing to endpoint handler', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    interface TodoPayload {
      title: string;
      tags?: string[];
      normalized?: boolean;
    }

    const TodoSchema = {
      title: String,
      tags: optional(array(String)),
    };

    app.mapPost(
      '/todos-normalized',
      [body(TodoSchema)],
      (todo: TodoPayload) => {
        return Results.json(todo);
      },
    ).addEndpointFilter(async (ctx, next) => {
      // Access and mutate argument 0
      const payload = ctx.getArgument<TodoPayload>(0);
      ctx.arguments[0] = {
        ...payload,
        title: payload.title.trim().toUpperCase(),
        normalized: true,
      };
      return await next(ctx);
    });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/todos-normalized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   clean architecture   ' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as TodoPayload;
    assert.strictEqual(data.title, 'CLEAN ARCHITECTURE');
    assert.strictEqual(data.normalized, true);
  });

  test('Declarative binding descriptors (V2 style) with body, service, query, route, header, and context', async () => {
    interface IOrderService {
      process(orderId: string, itemName: string, qty: number, tenant: string): any;
    }

    class OrderProcessingService implements IOrderService {
      public process(orderId: string, itemName: string, qty: number, tenant: string) {
        return {
          id: `ORD-${orderId}`,
          item: itemName,
          quantity: qty,
          tenant,
          processedAt: new Date().toISOString(),
        };
      }
    }

    // Typed token from @tsnx/hosting
    const ORDER_SERVICE_TOKEN = createToken<IOrderService>('IOrderService');

    const OrderItemSchema = {
      item: String,
      quantity: Number,
    };

    const RouteParamsSchema = {
      orderId: String,
    };

    const QueryParamsSchema = {
      notify: optional(Boolean),
    };

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    // Register by typed token
    builder.services.addScoped(ORDER_SERVICE_TOKEN, () => new OrderProcessingService());
    app = builder.build();

    // Map route with declarative descriptors tuple: [body, service(TOKEN), route, query, header, context]
    app.mapPost(
      '/orders/:orderId',
      [
        body(OrderItemSchema),
        service(ORDER_SERVICE_TOKEN),
        route(RouteParamsSchema),
        query(QueryParamsSchema),
        header('x-tenant-id'),
        context(),
      ],
      (orderBody, orderService, routeParams, queryParams, tenantId, httpCtx) => {
        assert.ok(httpCtx.request);
        const order = orderService.process(
          routeParams.orderId,
          orderBody.item,
          orderBody.quantity,
          tenantId ?? 'default-tenant',
        );

        return Results.created(
          {
            order,
            notify: queryParams.notify ?? false,
          },
          `/orders/${routeParams.orderId}`,
        );
      },
    );

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/orders/42?notify=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'acme-corp',
      },
      body: JSON.stringify({ item: 'Keyboard', quantity: 2 }),
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.headers.get('Location'), '/orders/42');
    const data = await res.json() as any;
    assert.strictEqual(data.order.id, 'ORD-42');
    assert.strictEqual(data.order.item, 'Keyboard');
    assert.strictEqual(data.order.quantity, 2);
    assert.strictEqual(data.order.tenant, 'acme-corp');
    assert.strictEqual(data.notify, true);
  });

  test('Rejects duplicate body() descriptors at registration time', () => {
    const builder = WebApplication.createBuilder();
    app = builder.build();

    const SchemaA = { a: String };
    const SchemaB = { b: String };

    assert.throws(
      () => {
        app!.mapPost('/duplicate-body', [body(SchemaA), body(SchemaB)], () => Results.ok());
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('found 2 body() descriptors'));
        return true;
      },
    );
  });

  test('RouteHandlerBuilder provides metadata, name, display name, and tags', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    const routeBuilder = app.mapGet('/products', () => Results.json({ products: [] }))
      .addEndpointFilter(async (ctx, next) => {
        ctx.httpContext.response.setHeader('X-Filter', 'yes');
        return await next(ctx);
      })
      .withName('GetProducts')
      .withDisplayName('Retrieve list of products')
      .withTags('Catalog', 'Public')
      .withMetadata({ rateLimit: 100, requiresAuth: false });

    // Verify RouteHandlerBuilder state
    assert.strictEqual(routeBuilder.getName(), 'GetProducts');
    assert.strictEqual(routeBuilder.getDisplayName(), 'Retrieve list of products');
    assert.deepStrictEqual(routeBuilder.getTags(), ['Catalog', 'Public']);
    assert.deepStrictEqual(routeBuilder.getMetadata(), { rateLimit: 100, requiresAuth: false });

    // Register second route directly on app
    app.mapGet('/categories', () => Results.json({ categories: [] }))
      .withName('GetCategories');

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/products`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-filter'), 'yes');

    const resCat = await fetch(`http://127.0.0.1:${port}/categories`);
    assert.strictEqual(resCat.status, 200);
  });

  test('M-10: framework-instantiated class filter is disposed after request (success, exception, short-circuit, and async)', async () => {
    let createdCount = 0;
    let disposedCount = 0;

    class DisposableFilter implements IEndpointFilter {
      constructor() {
        createdCount++;
      }
      async invokeAsync(ctx: EndpointFilterInvocationContext, next: EndpointFilterDelegate) {
        return await next(ctx);
      }
      dispose() {
        disposedCount++;
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/filter-disposal', () => Results.text('ok'))
      .addEndpointFilter(DisposableFilter);

    await app.start();
    const port = app.listeningPort;

    const res1 = await fetch(`http://127.0.0.1:${port}/filter-disposal`);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(createdCount, 1);
    assert.strictEqual(disposedCount, 1);

    const res2 = await fetch(`http://127.0.0.1:${port}/filter-disposal`);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(createdCount, 2);
    assert.strictEqual(disposedCount, 2);
  });

  test('M-10: framework-instantiated factory filter is disposed, while shared caller object filter is not', async () => {
    let factoryCreated = 0;
    let factoryDisposed = 0;
    let sharedDisposed = 0;

    class FactoryFilter implements IEndpointFilter {
      constructor() {
        factoryCreated++;
      }
      async invokeAsync(ctx: EndpointFilterInvocationContext, next: EndpointFilterDelegate) {
        return await next(ctx);
      }
      dispose() {
        factoryDisposed++;
      }
    }

    const sharedFilter: IEndpointFilter & { dispose: () => void } = {
      async invokeAsync(ctx, next) {
        return await next(ctx);
      },
      dispose() {
        sharedDisposed++;
      },
    };

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/factory-and-shared', () => Results.text('ok'))
      .addEndpointFilter(() => new FactoryFilter())
      .addEndpointFilter(sharedFilter);

    await app.start();
    const port = app.listeningPort;

    for (let i = 0; i < 3; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/factory-and-shared`);
      assert.strictEqual(res.status, 200);
    }

    assert.strictEqual(factoryCreated, 3);
    assert.strictEqual(factoryDisposed, 3, 'Factory-created filter instances must be disposed per request');
    assert.strictEqual(sharedDisposed, 0, 'Shared caller object filter must not be disposed by framework');
  });

  test('M-12: singleton filter resolved via factory (sp => sp.get(Filter)) is not disposed prematurely after request', async () => {
    let filterDisposed = 0;
    let invocations = 0;

    class SingletonFilter implements IEndpointFilter {
      async invokeAsync(ctx: EndpointFilterInvocationContext, next: EndpointFilterDelegate) {
        invocations++;
        return await next(ctx);
      }
      dispose() {
        filterDisposed++;
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addSingleton(SingletonFilter).toClass(SingletonFilter);
    app = builder.build();

    app.mapGet('/singleton-filter-test', () => Results.text('ok'))
      .addEndpointFilter((sp: any) => sp.get(SingletonFilter));

    await app.start();
    const port = app.listeningPort;

    // Send multiple requests: the singleton filter must survive and NOT be disposed in finally block
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/singleton-filter-test`);
      assert.strictEqual(res.status, 200);
    }

    assert.strictEqual(invocations, 3);
    assert.strictEqual(filterDisposed, 0, 'Singleton filter in DI must NOT be disposed after request execution');

    // Dispose host: the container must dispose the singleton filter
    await app.dispose();
    assert.strictEqual(filterDisposed, 1, 'Singleton filter must be disposed once when DI container is disposed');
  });

  test('M-12: scoped filter resolved via factory (sp => sp.get(Filter)) is disposed once by scope, not double-disposed', async () => {
    let filterDisposed = 0;

    class ScopedFilter implements IEndpointFilter {
      async invokeAsync(ctx: EndpointFilterInvocationContext, next: EndpointFilterDelegate) {
        return await next(ctx);
      }
      dispose() {
        filterDisposed++;
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addScoped(ScopedFilter).toClass(ScopedFilter);
    app = builder.build();

    app.mapGet('/scoped-filter-test', () => Results.text('ok'))
      .addEndpointFilter((sp: any) => sp.get(ScopedFilter));

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/scoped-filter-test`);
    assert.strictEqual(res.status, 200);

    // Wait brief tick for requestScope disposal to complete
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(filterDisposed, 1, 'Scoped filter in DI must be disposed exactly once by request scope, not twice');
  });
});
