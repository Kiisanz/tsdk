import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebApplication } from '../app/web-application.js';
import { Results } from '../http/results.js';

describe('WebApplication Integration', () => {
  let app: WebApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = undefined;
    }
  });

  test('starts HTTP server and handles GET and POST with scoped service resolution', async () => {
    let scopedInstanceCount = 0;
    class RequestScopedTracker {
      public readonly id = ++scopedInstanceCount;
      public disposed = false;
      public async dispose() {
        this.disposed = true;
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addScoped(RequestScopedTracker, () => new RequestScopedTracker());

    builder.build();
    app = builder.build();

    app.mapGet('/hello', () => Results.text('Hello TSDK!'));
    app.mapGet('/scoped', (ctx) => {
      const tracker = ctx.services.get(RequestScopedTracker);
      return Results.json({ trackerId: tracker.id });
    });
    app.mapPost('/echo', async (ctx) => {
      const body = await ctx.request.readJson<{ message: string }>();
      return Results.json({ echo: body.message });
    });

    await app.start();
    const port = app.listeningPort;
    assert.ok(port && port > 0);

    // 1. GET /hello
    const res1 = await fetch(`http://127.0.0.1:${port}/hello`);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(await res1.text(), 'Hello TSDK!');

    // 2. GET /scoped request 1
    const res2 = await fetch(`http://127.0.0.1:${port}/scoped`);
    const data2 = await res2.json() as any;
    assert.strictEqual(data2.trackerId, 1);

    // 3. GET /scoped request 2 (must be new scoped instance)
    const res3 = await fetch(`http://127.0.0.1:${port}/scoped`);
    const data3 = await res3.json() as any;
    assert.strictEqual(data3.trackerId, 2);

    // 4. POST /echo
    const res4 = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'pnpm test' }),
    });
    assert.strictEqual(res4.status, 200);
    const data4 = await res4.json() as any;
    assert.strictEqual(data4.echo, 'pnpm test');
  });

  test('handles 404, 405 Method Not Allowed with Allow header, and 413 Payload Too Large', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1', maxBodySizeBytes: 100 });
    app = builder.build();

    app.mapGet('/items', () => Results.ok({ ok: true }));

    await app.start();
    const port = app.listeningPort;

    // 1. 404 Not Found
    const notFoundRes = await fetch(`http://127.0.0.1:${port}/non-existent`);
    assert.strictEqual(notFoundRes.status, 404);

    // 2. 405 Method Not Allowed
    const methodRes = await fetch(`http://127.0.0.1:${port}/items`, { method: 'POST' });
    assert.strictEqual(methodRes.status, 405);
    assert.strictEqual(methodRes.headers.get('Allow'), 'GET, HEAD, OPTIONS');

    // 3. 413 Payload Too Large
    app.mapPost('/large', async (ctx) => {
      await ctx.request.readText();
      return Results.ok();
    });

    const largeRes = await fetch(`http://127.0.0.1:${port}/large`, {
      method: 'POST',
      body: 'X'.repeat(500),
    });
    assert.strictEqual(largeRes.status, 413);
  });

  test('does not crash or write duplicate headers when exception thrown after response started', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/partial-crash', (ctx) => {
      // Start sending response
      ctx.response.statusCode = 200;
      ctx.response.setHeader('Content-Type', 'text/plain');
      ctx.response.raw.write('Part 1...');
      // Now throw an error
      throw new Error('Boom after headers sent!');
    });

    await app.start();
    const port = app.listeningPort;

    // Fetch should receive initial chunk or aborted stream without server crashing
    try {
      const res = await fetch(`http://127.0.0.1:${port}/partial-crash`);
      await res.text();
    } catch {
      // Stream aborted by server destroying connection is expected
    }

    // Server should remain alive and handle subsequent requests normally
    app.mapGet('/ping', () => Results.text('pong'));
    const pingRes = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.strictEqual(pingRes.status, 200);
    assert.strictEqual(await pingRes.text(), 'pong');
  });

  test('HTTP correctness: HEAD requests return headers and Content-Length but empty body', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/greeting', () => Results.text('Hello World!'));

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/greeting`, { method: 'HEAD' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Content-Length'), '12');
    assert.strictEqual(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
    const body = await res.text();
    assert.strictEqual(body, '');
  });

  test('HTTP correctness: OPTIONS request returns 204 and Allow header', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/resource', () => Results.ok());
    app.mapPost('/resource', () => Results.ok());

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/resource`, { method: 'OPTIONS' });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Allow'), 'GET, HEAD, OPTIONS, POST');
    assert.strictEqual(await res.text(), '');
  });

  test('HTTP correctness: 204 No Content strips Content-Length and body', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapDelete('/item', () => Results.noContent());

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/item`, { method: 'DELETE' });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Content-Length'), null);
    assert.strictEqual(await res.text(), '');
  });

  test('HTTP correctness: StreamResult streams response without memory buffering', async () => {
    const { Readable } = await import('node:stream');
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/stream', () => {
      const stream = Readable.from(['chunk1;', 'chunk2;', 'chunk3']);
      return Results.stream(stream, 200, 'text/plain');
    });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/stream`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Content-Type'), 'text/plain');
    const text = await res.text();
    assert.strictEqual(text, 'chunk1;chunk2;chunk3');
  });

  test('Scoped DI is awaited and not disposed until streaming finishes', async () => {
    const { Readable } = await import('node:stream');
    const lifecycleEvents: string[] = [];

    class StreamLifecycleService {
      public disposed = false;
      public async dispose() {
        this.disposed = true;
        lifecycleEvents.push('scoped-disposed');
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addScoped(StreamLifecycleService, () => new StreamLifecycleService());
    app = builder.build();

    app.mapGet('/stream-lifecycle', (ctx) => {
      ctx.services.get(StreamLifecycleService); // ensure resolved in scope
      async function* generateData() {
        lifecycleEvents.push('chunk-1');
        yield 'A';
        await new Promise((r) => setTimeout(r, 20));
        lifecycleEvents.push('chunk-2');
        yield 'B';
      }
      return Results.stream(Readable.from(generateData()), 200, 'text/plain');
    });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/stream-lifecycle`);
    const text = await res.text();
    assert.strictEqual(text, 'AB');

    // Verification: all chunks must be produced BEFORE scoped DI disposal
    assert.deepStrictEqual(lifecycleEvents, ['chunk-1', 'chunk-2', 'scoped-disposed']);
  });

  test('Header validation rejects invalid header names and CRLF injection', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/bad-header-name', (ctx) => {
      ctx.response.setHeader('Bad Name With Space', 'value');
      return Results.ok();
    });

    app.mapGet('/crlf-header-value', (ctx) => {
      ctx.response.setHeader('X-Custom', 'value\r\nInjected: malicious');
      return Results.ok();
    });

    await app.start();
    const port = app.listeningPort;

    const res1 = await fetch(`http://127.0.0.1:${port}/bad-header-name`);
    assert.strictEqual(res1.status, 500); // Unhandled exception caught by error boundary

    const res2 = await fetch(`http://127.0.0.1:${port}/crlf-header-value`);
    assert.strictEqual(res2.status, 500);
  });

  test('Request execution timeout aborts slow handlers with 503 Problem Details', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1', requestExecutionTimeoutMs: 50 });
    app = builder.build();

    app.mapGet('/slow', async () => {
      await new Promise((r) => setTimeout(r, 120));
      return Results.text('slow-response');
    });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/slow`);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.headers.get('Content-Type'), 'application/problem+json; charset=utf-8');
    const problem = await res.json() as any;
    assert.strictEqual(problem.type, 'https://tsnx.dev/problems/timeout');
    assert.strictEqual(problem.status, 503);
    assert.strictEqual(problem.title, 'Service Unavailable');
  });

  test('WebApplicationBuilder exposes serviceProviderOptions and respects validateOnBuild', async () => {
    class IncompleteService {
      constructor(public dep: any) {}
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.configureServiceProvider({ validateOnBuild: true });
    builder.services.addSingleton(IncompleteService).toClass(IncompleteService, 'UnavailableToken' as any);

    app = builder.build();

    await assert.rejects(
      async () => {
        await app!.start();
      },
      (err: any) => err.name === 'ServiceNotFoundError' || /UnavailableToken/.test(err.message),
    );
  });

  test('WebApplication automatically reads Server:Port and Server:Host from configuration', async () => {
    // Configure through CLI args without calling configureServer()
    const builder = WebApplication.createBuilder(['--Server:Port=0', '--Server:Host=127.0.0.1']);

    app = builder.build();
    app.mapGet('/health', () => Results.ok({ status: 'healthy' }));

    await app.start();

    assert.equal(app.serverOptions.host, '127.0.0.1');
    assert(app.listeningPort !== undefined && app.listeningPort > 0);

    const res = await fetch(`http://127.0.0.1:${app.listeningPort}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'healthy');
  });

  test('WebApplication integrates with Options pattern and validateOnStart', async () => {
    interface ApiConfig {
      title: string;
      version: string;
    }

    const API_CONFIG = 'ApiConfig';

    const builder = WebApplication.createBuilder(['--Server:Port=0', '--Api:Title=MyTask Api', '--Api:Version=v1']);

    builder.services
      .configure<ApiConfig>(API_CONFIG)
      .bindConfiguration('Api')
      .validate((opts) => opts.version === 'v1', 'Version must be v1')
      .validateOnStart();

    app = builder.build();

    app.mapGet('/info', (ctx) => {
      const config = ctx.requestServices.get<ApiConfig>(API_CONFIG);
      return Results.ok(config);
    });

    await app.start();

    const res = await fetch(`http://127.0.0.1:${app.listeningPort}/info`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.title, 'MyTask Api');
    assert.equal(body.version, 'v1');
  });
});

