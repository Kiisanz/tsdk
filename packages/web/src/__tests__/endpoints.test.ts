import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  WebApplication,
  Results,
  type IEndpoint,
  type IEndpoints,
  type IEndpointRouteBuilder,
} from '../index.js';

describe('IEndpoint and IEndpointRouteBuilder', () => {
  let app: WebApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = undefined;
    }
  });

  test('maps routes using class implementing IEndpoint on WebApplication', async () => {
    class UserEndpoints implements IEndpoint {
      mapEndpoint(routes: IEndpointRouteBuilder): void {
        routes.mapGet('/users', () => Results.json([{ id: 1, name: 'Alice' }]));
        routes.mapPost('/users', async (ctx) => {
          const body = await ctx.request.readJson<{ name: string }>();
          return Results.created('/users/2', { id: 2, name: body.name });
        });
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapEndpoint(UserEndpoints);

    await app.start();
    const port = app.listeningPort;

    const res1 = await fetch(`http://127.0.0.1:${port}/users`);
    assert.strictEqual(res1.status, 200);
    const users = await res1.json();
    assert.deepStrictEqual(users, [{ id: 1, name: 'Alice' }]);

    const res2 = await fetch(`http://127.0.0.1:${port}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob' }),
    });
    assert.strictEqual(res2.status, 201);
    const created = await res2.json();
    assert.deepStrictEqual(created, { id: 2, name: 'Bob' });
  });

  test('maps multiple endpoints via mapEndpoints(ClassA, ClassB) and array', async () => {
    class InventoryEndpoints implements IEndpoint {
      mapEndpoint(routes: IEndpointRouteBuilder): void {
        routes.mapGet('/warehouses', () => Results.json(['Main', 'Sub']));
      }
    }

    class OrderEndpoints implements IEndpoints {
      mapEndpoint(routes: IEndpointRouteBuilder): void {
        routes.mapGet('/orders', () => Results.json(['Order-101']));
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapEndpoints([InventoryEndpoints, OrderEndpoints]);

    await app.start();
    const port = app.listeningPort;

    const res1 = await fetch(`http://127.0.0.1:${port}/warehouses`);
    assert.deepStrictEqual(await res1.json(), ['Main', 'Sub']);

    const res2 = await fetch(`http://127.0.0.1:${port}/orders`);
    assert.deepStrictEqual(await res2.json(), ['Order-101']);
  });

  test('maps functional endpoint and object instance with mapEndpoints / map', async () => {
    function healthEndpoint(routes: IEndpointRouteBuilder): void {
      routes.mapGet('/health', () => Results.ok({ status: 'healthy' }));
    }

    const metricsEndpoint = {
      map(routes: IEndpointRouteBuilder) {
        routes.mapGet('/metrics', () => Results.text('uptime: 100s'));
      },
    };

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapEndpoints(healthEndpoint, metricsEndpoint);

    await app.start();
    const port = app.listeningPort;

    const res1 = await fetch(`http://127.0.0.1:${port}/health`);
    assert.deepStrictEqual(await res1.json(), { status: 'healthy' });

    const res2 = await fetch(`http://127.0.0.1:${port}/metrics`);
    assert.strictEqual(await res2.text(), 'uptime: 100s');
  });

  test('maps endpoints onto RouteGroupBuilder with prefix and inherited metadata', async () => {
    class ProductEndpoints implements IEndpoint {
      mapEndpoint(routes: IEndpointRouteBuilder): void {
        routes.mapGet('/products', () => Results.json([{ id: 'p1' }]));
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    const apiV1 = app.mapGroup('/api/v1').withTags('Catalog');
    apiV1.mapEndpoints(ProductEndpoints);

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/products`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), [{ id: 'p1' }]);

    const endpointInfo = app.endpoints.find((ep) => ep.pattern === '/api/v1/products');
    assert.ok(endpointInfo);
    assert.deepStrictEqual(endpointInfo.metadata.getTags(), ['Catalog']);
  });

  test('supports endpoints creating nested sub-groups', async () => {
    class NestedCustomerEndpoints implements IEndpoint {
      mapEndpoint(routes: IEndpointRouteBuilder): void {
        const group = routes.mapGroup('/customers').withTags('Customers');
        group.mapGet('/', () => Results.json(['Alice', 'Charlie']));
        group.mapGet('/:id', (ctx) => Results.json({ id: ctx.params.id }));
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    // Map on root
    app.mapEndpoints(NestedCustomerEndpoints);

    await app.start();
    const port = app.listeningPort;

    const res1 = await fetch(`http://127.0.0.1:${port}/customers`);
    assert.deepStrictEqual(await res1.json(), ['Alice', 'Charlie']);

    const res2 = await fetch(`http://127.0.0.1:${port}/customers/42`);
    assert.deepStrictEqual(await res2.json(), { id: '42' });
  });

  test('registers endpoints in DI via builder.services.addEndpoint() and maps with app.mapEndpoints()', async () => {
    class ModuleAEndpoints implements IEndpoint {
      mapEndpoint(routes: IEndpointRouteBuilder): void {
        routes.mapGet('/module-a', () => Results.text('from module a'));
      }
    }

    class ModuleBEndpoints implements IEndpoint {
      mapEndpoint(routes: IEndpointRouteBuilder): void {
        routes.mapGet('/module-b', () => Results.text('from module b'));
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    // Register via DI (e.g. from an IServiceInstaller or builder)
    builder.services.addEndpoint(ModuleAEndpoints);
    builder.addEndpoints([ModuleBEndpoints]);

    app = builder.build();

    // 0-argument mapEndpoints() discovers all registered IEndpoints from DI
    app.mapEndpoints();

    await app.start();
    const port = app.listeningPort;

    const resA = await fetch(`http://127.0.0.1:${port}/module-a`);
    assert.strictEqual(await resA.text(), 'from module a');

    const resB = await fetch(`http://127.0.0.1:${port}/module-b`);
    assert.strictEqual(await resB.text(), 'from module b');
  });
});
