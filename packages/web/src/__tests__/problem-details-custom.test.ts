import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebApplication } from '../app/web-application.js';
import { Results } from '../http/results.js';
import { body } from '../descriptors/descriptors.js';

describe('ProblemDetails Customization', () => {
  it('invokes customizeProblemDetails hook for Results.problem, 404, binding errors, and unhandled exceptions', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    // Configure global ProblemDetails customization hook
    builder.addProblemDetails((options) => {
      options.customize = (ctx, problem) => {
        problem.extensions = {
          ...(problem.extensions ?? {}),
          requestId: ctx.traceIdentifier,
          customAppTag: 'TSNX-Enterprise',
        };
      };
    });

    const app = builder.build();

    // 1. Explicit Results.problem
    app.mapGet('/manual-problem', () => {
      return Results.problem({
        title: 'Custom Error',
        status: 400,
        detail: 'Something went wrong',
      });
    });

    // 2. Unhandled exception
    app.mapGet('/crash', () => {
      throw new Error('Explosion');
    });

    // 3. Binding error
    app.mapPost('/bind', [body({ name: String })], (data) => Results.json(data));

    await app.start();
    const port = app.listeningPort!;

    try {
      // Test 1: Manual problem
      const res1 = await fetch(`http://127.0.0.1:${port}/manual-problem`);
      assert.equal(res1.status, 400);
      const json1 = (await res1.json()) as any;
      assert.equal(json1.customAppTag, 'TSNX-Enterprise');
      assert.ok(json1.requestId);

      // Test 2: Unhandled exception
      const res2 = await fetch(`http://127.0.0.1:${port}/crash`);
      assert.equal(res2.status, 500);
      const json2 = (await res2.json()) as any;
      assert.equal(json2.customAppTag, 'TSNX-Enterprise');
      assert.ok(json2.requestId);

      // Test 3: Route not found (404)
      const res3 = await fetch(`http://127.0.0.1:${port}/non-existent-route`);
      assert.equal(res3.status, 404);
      const json3 = (await res3.json()) as any;
      assert.equal(json3.customAppTag, 'TSNX-Enterprise');
      assert.ok(json3.requestId);

      // Test 4: Body parsing error (e.g. invalid JSON)
      const res4 = await fetch(`http://127.0.0.1:${port}/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{',
      });
      assert.equal(res4.status, 400);
      const json4 = (await res4.json()) as any;
      assert.equal(json4.customAppTag, 'TSNX-Enterprise');
      assert.ok(json4.requestId);
    } finally {
      await app.stop();
    }
  });
});
