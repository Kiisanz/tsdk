import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Readable } from 'node:stream';
import { WebApplication } from '../app/web-application.js';
import { Results } from '../http/results.js';

describe('HTTP Request Lifecycle & Cancellation', () => {
  let app: WebApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = undefined;
    }
  });

  test('normal request completion does NOT abort signal (signal.aborted remains false)', async () => {
    let handlerSignalAborted: boolean | undefined;
    let completedSignalAborted: boolean | undefined;

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/normal', (ctx) => {
      handlerSignalAborted = ctx.request.signal.aborted;
      ctx.response.onCompleted(() => {
        completedSignalAborted = ctx.request.signal.aborted;
      });
      return Results.json({ success: true });
    });

    await app.start();
    const port = app.listeningPort!;

    const res = await fetch(`http://127.0.0.1:${port}/normal`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { success: true });

    assert.strictEqual(handlerSignalAborted, false);
    assert.strictEqual(completedSignalAborted, false);
  });

  test('onStarting() runs before headers commit and allows modifying headers and status', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/starting-hook', (ctx) => {
      ctx.response.onStarting(() => {
        ctx.response.setHeader('X-Custom-Starting', 'true');
      });
      return Results.text('hello from handler');
    });

    await app.start();
    const port = app.listeningPort!;

    const res = await fetch(`http://127.0.0.1:${port}/starting-hook`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('X-Custom-Starting'), 'true');
    assert.strictEqual(await res.text(), 'hello from handler');
  });

  test('onStarting() throws if registered after response has already started', async () => {
    let startingError: Error | undefined;

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/late-starting', async (ctx) => {
      await ctx.response.writeText('started');
      try {
        ctx.response.onStarting(() => {});
      } catch (err: any) {
        startingError = err;
      }
    });

    await app.start();
    const port = app.listeningPort!;

    const res = await fetch(`http://127.0.0.1:${port}/late-starting`);
    assert.strictEqual(res.status, 200);
    assert.ok(startingError, 'Expected onStarting to throw when registered after headers sent');
    assert.match(startingError.message, /Cannot register onStarting callback after response has started/);
  });

  test('onCompleted() runs exactly once and allows accessing scoped DI services before disposal', async () => {
    const lifecycleEvents: string[] = [];

    class AuditService {
      public record(action: string) {
        lifecycleEvents.push(`audit:${action}`);
      }
      public async dispose() {
        lifecycleEvents.push('scoped:disposed');
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addScoped(AuditService, () => new AuditService());
    app = builder.build();

    let completedCallCount = 0;

    app.mapGet('/completed-di', (ctx) => {
      const audit = ctx.services.get(AuditService);
      audit.record('handler');

      ctx.response.onCompleted(async () => {
        completedCallCount++;
        // Scoped DI must still be functional here!
        audit.record('onCompleted');
        lifecycleEvents.push('onCompleted:executed');
      });

      return Results.json({ ok: true });
    });

    await app.start();
    const port = app.listeningPort!;

    const res = await fetch(`http://127.0.0.1:${port}/completed-di`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(completedCallCount, 1);

    // Verify ordering: handler -> onCompleted (with scoped DI accessible) -> scoped:disposed
    assert.deepStrictEqual(lifecycleEvents, [
      'audit:handler',
      'audit:onCompleted',
      'onCompleted:executed',
      'scoped:disposed',
    ]);
  });

  test('exceptions in onCompleted() callbacks are handled safely without crash or secondary response', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/throw-in-completed', (ctx) => {
      ctx.response.onCompleted(() => {
        throw new Error('Explosion in onCompleted callback');
      });
      return Results.json({ message: 'safe' });
    });

    await app.start();
    const port = app.listeningPort!;

    const res = await fetch(`http://127.0.0.1:${port}/throw-in-completed`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { message: 'safe' });
  });

  test('client disconnect aborts signal with AbortError and triggers onCompleted()', async () => {
    let signalAborted = false;
    let abortReasonName: string | undefined;
    let onCompletedFired = false;
    let handlerStartedResolve: () => void;
    const handlerStartedPromise = new Promise<void>((r) => {
      handlerStartedResolve = r;
    });

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/disconnect', async (ctx) => {
      ctx.response.onCompleted(() => {
        onCompletedFired = true;
      });

      ctx.request.signal.addEventListener('abort', () => {
        signalAborted = ctx.request.signal.aborted;
        abortReasonName = ctx.request.signal.reason?.name;
      });

      handlerStartedResolve();

      // Wait indefinitely or until signal aborts
      await new Promise<void>((resolve) => {
        ctx.request.signal.addEventListener('abort', () => resolve(), { once: true });
      });

      return Results.text('never sent');
    });

    await app.start();
    const port = app.listeningPort!;

    // Send HTTP request and destroy socket abruptly
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/disconnect',
      method: 'GET',
    });

    req.on('error', () => {}); // Handle expected ECONNRESET / socket hang up on client side

    req.end();
    await handlerStartedPromise;

    // Forcefully destroy the client socket to simulate client disconnect
    req.destroy();

    // Give server event loop a brief moment to process disconnect and lifecycle
    await new Promise((r) => setTimeout(r, 60));

    assert.strictEqual(signalAborted, true);
    assert.strictEqual(abortReasonName, 'AbortError');
    assert.strictEqual(onCompletedFired, true);
  });

  test('requestExecutionTimeoutMs aborts with TimeoutError and returns 503 Problem Details', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1', requestExecutionTimeoutMs: 60 });
    app = builder.build();

    app.mapGet('/timeout-test', async () => {
      await new Promise((r) => setTimeout(r, 150));
      return Results.text('finished');
    });

    await app.start();
    const port = app.listeningPort!;

    const res = await fetch(`http://127.0.0.1:${port}/timeout-test`);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.headers.get('Content-Type'), 'application/problem+json; charset=utf-8');

    const problem = await res.json() as any;
    assert.strictEqual(problem.type, 'https://tsnx.dev/problems/timeout');
    assert.strictEqual(problem.status, 503);
    assert.strictEqual(problem.title, 'Service Unavailable');
    assert.match(problem.detail, /exceeded timeout of 60ms/);
  });

  test('requestExecutionTimeoutMs during streaming destroys stream and aborts signal', async () => {
    let streamAborted = false;

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1', requestExecutionTimeoutMs: 50 });
    app = builder.build();

    app.mapGet('/stream-timeout', (ctx) => {
      async function* generate() {
        yield 'chunk1';
        try {
          await new Promise((r) => setTimeout(r, 100));
          yield 'chunk2';
        } catch {
          streamAborted = true;
        }
      }

      ctx.request.signal.addEventListener('abort', () => {
        streamAborted = true;
      });

      return Results.stream(Readable.from(generate()), 200, 'text/plain');
    });

    await app.start();
    const port = app.listeningPort!;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/stream-timeout`);
      await res.text();
    } catch {
      // Stream destroyed abruptly by server timeout
    }

    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(streamAborted, true);
  });

  test('graceful shutdown: in-flight request finishes cleanly within shutdownDrainTimeoutMs', async () => {
    let requestFinished = false;

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1', shutdownDrainTimeoutMs: 1000 });
    app = builder.build();

    app.mapGet('/in-flight', async () => {
      await new Promise((r) => setTimeout(r, 80));
      requestFinished = true;
      return Results.json({ completed: true });
    });

    await app.start();
    const port = app.listeningPort!;

    // Start request in background
    const requestPromise = fetch(`http://127.0.0.1:${port}/in-flight`);

    // Initiate server stop while request is in-flight
    await new Promise((r) => setTimeout(r, 20));
    const stopPromise = app.stop();

    const [res] = await Promise.all([requestPromise, stopPromise]);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { completed: true });
    assert.strictEqual(requestFinished, true);

    // New requests should be rejected since server stopped listening
    await assert.rejects(async () => {
      await fetch(`http://127.0.0.1:${port}/in-flight`);
    });
  });

  test('graceful shutdown: lingering request exceeding shutdownDrainTimeoutMs is aborted', async () => {
    let signalAborted = false;
    let abortReasonName: string | undefined;

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1', shutdownDrainTimeoutMs: 60 });
    app = builder.build();

    let handlerStartedResolve: () => void;
    const handlerStartedPromise = new Promise<void>((r) => {
      handlerStartedResolve = r;
    });

    app.mapGet('/lingering', async (ctx) => {
      ctx.request.signal.addEventListener('abort', () => {
        signalAborted = ctx.request.signal.aborted;
        abortReasonName = ctx.request.signal.reason?.name;
      });

      handlerStartedResolve();

      // Simulates an unresponsive/lingering operation
      await new Promise((r) => setTimeout(r, 500));
      return Results.text('done');
    });

    await app.start();
    const port = app.listeningPort!;

    // Initiate request
    const reqPromise = fetch(`http://127.0.0.1:${port}/lingering`).catch(() => undefined);

    await handlerStartedPromise;
    // Trigger stop with 60ms drain timeout
    await app.stop();

    await reqPromise;

    assert.strictEqual(signalAborted, true);
    assert.strictEqual(abortReasonName, 'AbortError');
  });

  test('Clean Architecture: UseCase accepts AbortSignal without importing @tsnx/web', async () => {
    // Pure application domain UseCase (zero @tsnx/web dependencies)
    class SearchItemsUseCase {
      public async execute(query: string, cancellationToken?: AbortSignal): Promise<string[]> {
        if (cancellationToken?.aborted) {
          throw new DOMException('Operation canceled', 'AbortError');
        }
        return [`result for ${query}`];
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    builder.services.addScoped(SearchItemsUseCase, () => new SearchItemsUseCase());
    app = builder.build();

    app.mapGet('/search', async (ctx) => {
      const useCase = ctx.services.get(SearchItemsUseCase);
      const items = await useCase.execute('books', ctx.request.signal);
      return Results.json(items);
    });

    await app.start();
    const port = app.listeningPort!;

    const res = await fetch(`http://127.0.0.1:${port}/search`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, ['result for books']);
  });
});
