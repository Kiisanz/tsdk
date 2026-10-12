import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  WebApplication,
  Results,
  body,
  service,
  query,
  route,
  header,
  context,
  createToken,
  optional,
} from '../index.js';

describe('Milestone 05: Route Groups & Structured Endpoint Metadata', () => {
  let app: WebApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = undefined;
    }
  });

  test('Route groups concatenate path prefixes accurately', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    const api = app.mapGroup('/api/v1');
    const products = api.mapGroup('/products');

    products.mapGet('/', () => Results.text('all products'));
    products.mapGet('/:id', (ctx) => Results.text(`product ${ctx.params.id}`));

    await app.start();
    const port = app.listeningPort;

    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/products`);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(await res1.text(), 'all products');

    const res2 = await fetch(`http://127.0.0.1:${port}/api/v1/products/42`);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(await res2.text(), 'product 42');
  });

  test('Metadata inheritance: tags accumulate and deduplicate, summary/description override, produces accumulates', async () => {
    const builder = WebApplication.createBuilder();
    app = builder.build();

    const ProductListSchema = { items: Array };
    const ProductSchema = { id: String, name: String };

    // Parent group
    const api = app.mapGroup('/api/v1')
      .withTags('API', 'v1')
      .withSummary('API Level Summary')
      .withDescription('API Level Description')
      .producesProblem(500);

    // Child group
    const products = api.mapGroup('/products')
      .withTags('Products', 'API') // 'API' is duplicate from parent
      .withSummary('Products Group Summary')
      .produces(404);

    // Endpoint 1: overrides summary & description, adds tag and produces
    const getEndpoint = products.mapGet('/', () => Results.ok())
      .withName('GetProducts')
      .withTags('Public', 'Products') // 'Products' is duplicate from child group
      .withSummary('Get all products')
      .withDescription('Returns the entire product catalog')
      .produces(200, ProductListSchema);

    // Endpoint 2: inherits summary from products group
    const createEndpoint = products.mapPost('/', () => Results.ok())
      .withName('CreateProduct')
      .produces(201, ProductSchema)
      .producesProblem(400);

    // 1. Verify Endpoint 1 effective metadata
    const meta1 = getEndpoint.buildEffectiveMetadata();
    // Tags: parent ('API', 'v1') -> child ('Products') -> endpoint ('Public'), deduplicated
    assert.deepStrictEqual(meta1.getTags(), ['API', 'v1', 'Products', 'Public']);
    // Summary & Description: endpoint overrides groups
    assert.strictEqual(meta1.getSummary(), 'Get all products');
    assert.strictEqual(meta1.getDescription(), 'Returns the entire product catalog');
    // Produces: 500 (from api), 404 (from products), 200 (from endpoint)
    const produces1 = meta1.getProduces();
    assert.strictEqual(produces1.length, 3);
    assert.ok(produces1.some(p => p.statusCode === 500 && p.kind === 'produces_problem'));
    assert.ok(produces1.some(p => p.statusCode === 404 && p.kind === 'produces'));
    assert.ok(produces1.some(p => p.statusCode === 200 && p.kind === 'produces'));

    // 2. Verify Endpoint 2 effective metadata
    const meta2 = createEndpoint.buildEffectiveMetadata();
    assert.deepStrictEqual(meta2.getTags(), ['API', 'v1', 'Products']);
    // Inherits summary from closest parent group (products)
    assert.strictEqual(meta2.getSummary(), 'Products Group Summary');
    // Inherits description from api group
    assert.strictEqual(meta2.getDescription(), 'API Level Description');
    // Produces: 500 (from api), 404 (from products), 201 (from endpoint), 400 (from endpoint)
    const produces2 = meta2.getProduces();
    assert.strictEqual(produces2.length, 4);
    assert.ok(produces2.some(p => p.statusCode === 201));
    assert.ok(produces2.some(p => p.statusCode === 400));
  });

  test('Filter inheritance: parent group filters execute before child group filters, before endpoint filters', async () => {
    const executionOrder: string[] = [];

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    const api = app.mapGroup('/api')
      .addEndpointFilter(async (ctx, next) => {
        executionOrder.push('parent-group:enter');
        const res = await next(ctx);
        executionOrder.push('parent-group:exit');
        return res;
      });

    const v1 = api.mapGroup('/v1')
      .addEndpointFilter(async (ctx, next) => {
        executionOrder.push('child-group:enter');
        const res = await next(ctx);
        executionOrder.push('child-group:exit');
        return res;
      });

    v1.mapGet('/items', () => {
      executionOrder.push('endpoint-handler');
      return Results.text('items');
    }).addEndpointFilter(async (ctx, next) => {
      executionOrder.push('endpoint-filter:enter');
      const res = await next(ctx);
      executionOrder.push('endpoint-filter:exit');
      return res;
    });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/items`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'items');

    assert.deepStrictEqual(executionOrder, [
      'parent-group:enter',
      'child-group:enter',
      'endpoint-filter:enter',
      'endpoint-handler',
      'endpoint-filter:exit',
      'child-group:exit',
      'parent-group:exit',
    ]);
  });

  test('Late group configuration: filters and metadata added after endpoint creation are still inherited at runtime', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    const api = app.mapGroup('/api');

    // 1. Endpoint created FIRST
    api.mapGet('/users', () => Results.text('users'));

    // 2. Group filter and tag added AFTERWARDS
    api.addEndpointFilter(async (ctx, next) => {
      ctx.httpContext.response.setHeader('X-Group-Late-Filter', 'applied');
      return await next(ctx);
    });
    api.withTags('LateConfigTag');

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/api/users`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-group-late-filter'), 'applied');

    // Introspect endpoint to verify metadata compilation
    const userEndpoint = app.endpoints.find(e => e.pattern === '/api/users');
    assert.ok(userEndpoint);
    assert.ok(userEndpoint.metadata.getTags().includes('LateConfigTag'));
  });

  test('Route groups share the same DI request scope (no isolated group container)', async () => {
    class RequestTracker {
      public static instanceCount = 0;
      public readonly id = ++RequestTracker.instanceCount;
    }

    let filterCapturedId: number | undefined;
    let handlerCapturedId: number | undefined;

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addScoped(RequestTracker, () => new RequestTracker());
    app = builder.build();

    const group = app.mapGroup('/scoped-test')
      .addEndpointFilter(async (ctx, next) => {
        const tracker = ctx.httpContext.services.get(RequestTracker);
        filterCapturedId = tracker.id;
        return await next(ctx);
      });

    group.mapGet('/check', (ctx) => {
      const tracker = ctx.services.get(RequestTracker);
      handlerCapturedId = tracker.id;
      return Results.ok();
    });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/scoped-test/check`);
    assert.strictEqual(res.status, 200);
    // Must be identical instance in the same request
    assert.ok(filterCapturedId !== undefined);
    assert.strictEqual(filterCapturedId, handlerCapturedId);
  });

  test('OpenAPI Bridge: app.endpoints exposes full descriptors and structured metadata for static introspection', () => {
    interface IUserService {
      findUser(id: string): any;
    }
    const USER_SERVICE_TOKEN = createToken<IUserService>('IUserService');

    const UserBodySchema = {
      name: String,
      email: String,
    };

    const RouteParamsSchema = {
      userId: String,
    };

    const QueryParamsSchema = {
      includeProfile: optional(Boolean),
    };

    const builder = WebApplication.createBuilder();
    app = builder.build();

    const api = app.mapGroup('/api/v1')
      .withTags('Users API');

    api.mapPost(
      '/users/:userId',
      [
        body(UserBodySchema),
        service(USER_SERVICE_TOKEN),
        route(RouteParamsSchema),
        query(QueryParamsSchema),
        header('x-api-key'),
        context(),
      ],
      () => Results.ok(),
    )
      .withName('CreateUserWithProfile')
      .withSummary('Create user with profile')
      .withDescription('Registers a new user account')
      .produces(201, UserBodySchema)
      .producesProblem(400);

    // Introspect endpoint registry statically (simulating Milestone 06 OpenAPI Generator)
    const endpoints = app.endpoints;
    assert.strictEqual(endpoints.length, 1);

    const ep = endpoints[0];
    assert.strictEqual(ep.method, 'POST');
    assert.strictEqual(ep.pattern, '/api/v1/users/:userId');

    // 1. Verify descriptors metadata
    assert.strictEqual(ep.descriptors.length, 6);
    assert.strictEqual(ep.descriptors[0].source, 'body');
    assert.strictEqual(ep.descriptors[0].schema, UserBodySchema);

    assert.strictEqual(ep.descriptors[1].source, 'service');
    assert.strictEqual(ep.descriptors[1].token, USER_SERVICE_TOKEN);

    assert.strictEqual(ep.descriptors[2].source, 'route');
    assert.strictEqual(ep.descriptors[2].schema, RouteParamsSchema);

    assert.strictEqual(ep.descriptors[3].source, 'query');
    assert.strictEqual(ep.descriptors[3].schema, QueryParamsSchema);

    assert.strictEqual(ep.descriptors[4].source, 'header');
    assert.strictEqual(ep.descriptors[4].name, 'x-api-key');

    assert.strictEqual(ep.descriptors[5].source, 'context');

    // 2. Verify structured metadata
    assert.strictEqual(ep.builder?.getName(), 'CreateUserWithProfile');
    assert.strictEqual(ep.metadata.getSummary(), 'Create user with profile');
    assert.strictEqual(ep.metadata.getDescription(), 'Registers a new user account');
    assert.deepStrictEqual(ep.metadata.getTags(), ['Users API']);

    const produces = ep.metadata.getProduces();
    assert.strictEqual(produces.length, 2);
    assert.ok(produces.some(p => p.statusCode === 201 && p.kind === 'produces'));
    assert.ok(produces.some(p => p.statusCode === 400 && p.kind === 'produces_problem'));
  });

  test('Duplicate endpoint names fail fast during registry finalization at startup', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/users', () => Results.ok()).withName('GetItems');
    app.mapGet('/products', () => Results.ok()).withName('GetItems');

    await assert.rejects(
      async () => {
        await app!.start();
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Duplicate endpoint name 'GetItems'"));
        return true;
      },
    );
  });

  test('Metadata schema override: endpoint produces replaces group produces for same status code and content type', () => {
    const BaseSchema = { base: String };
    const DetailedSchema = { detailed: String };

    const builder = WebApplication.createBuilder();
    app = builder.build();

    const group = app.mapGroup('/items')
      .produces(200, BaseSchema);

    const ep = group.mapGet('/', () => Results.ok())
      .produces(200, DetailedSchema);

    const effectiveProduces = ep.buildEffectiveMetadata().getProduces();
    // Must be exactly 1 entry for 200 with DetailedSchema
    assert.strictEqual(effectiveProduces.length, 1);
    assert.strictEqual(effectiveProduces[0].statusCode, 200);
    assert.strictEqual(effectiveProduces[0].kind, 'produces');
    if (effectiveProduces[0].kind === 'produces') {
      assert.strictEqual(effectiveProduces[0].schema, DetailedSchema);
    }
  });

  test('Precompilation: router.finalize() precompiles effective filters and metadata before listening', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    const group = app.mapGroup('/precompiled')
      .withTags('GroupTag')
      .addEndpointFilter(async (ctx, next) => await next(ctx));

    group.mapGet('/route', () => Results.ok())
      .withName('PrecompiledRoute')
      .withTags('EndpointTag');

    // Before start: endpoints getter still works
    assert.strictEqual(app.endpoints.length, 1);

    // Start triggers finalize()
    await app.start();

    // Introspect compiled metadata and filters
    const ep = app.endpoints[0];
    assert.ok(ep.metadata.getTags().includes('GroupTag'));
    assert.ok(ep.metadata.getTags().includes('EndpointTag'));
  });
});
