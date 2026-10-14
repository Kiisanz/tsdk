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
    class OrderProcessingService {
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
    builder.services.addScoped(OrderProcessingService, () => new OrderProcessingService());
    app = builder.build();

    // Map route with declarative descriptors tuple: [body, service, route, query, header, context]
    app.mapPost(
      '/orders/:orderId',
      [
        body(OrderItemSchema),
        service(OrderProcessingService),
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

  test('RouteHandlerBuilder allows fluent route chaining', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    // Fluent chaining of multiple routes on RouteHandlerBuilder
    app.mapGet('/route-a', () => Results.text('A'))
      .addEndpointFilter(async (ctx, next) => {
        ctx.httpContext.response.setHeader('X-Route', 'A');
        return await next(ctx);
      })
      .mapGet('/route-b', () => Results.text('B'))
      .addEndpointFilter(async (ctx, next) => {
        ctx.httpContext.response.setHeader('X-Route', 'B');
        return await next(ctx);
      })
      .mapPost('/route-c', () => Results.text('C'));

    await app.start();
    const port = app.listeningPort;

    const resA = await fetch(`http://127.0.0.1:${port}/route-a`);
    assert.strictEqual(await resA.text(), 'A');
    assert.strictEqual(resA.headers.get('x-route'), 'A');

    const resB = await fetch(`http://127.0.0.1:${port}/route-b`);
    assert.strictEqual(await resB.text(), 'B');
    assert.strictEqual(resB.headers.get('x-route'), 'B');

    const resC = await fetch(`http://127.0.0.1:${port}/route-c`, { method: 'POST' });
    assert.strictEqual(await resC.text(), 'C');
  });
});
