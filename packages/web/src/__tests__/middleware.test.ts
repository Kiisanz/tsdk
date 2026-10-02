import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MiddlewarePipeline } from '../middleware/pipeline.js';
import { HttpContext } from '../http/http-context.js';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

function createMockContext(): HttpContext {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req);
  const mockProvider = {
    get: () => undefined,
    getOptional: () => undefined,
    createScope: () => ({ serviceProvider: {} as any, dispose: async () => {} }),
  };
  return new HttpContext(req, res, mockProvider as any, new AbortController().signal);
}

describe('MiddlewarePipeline', () => {
  test('executes in onion order', async () => {
    const pipeline = new MiddlewarePipeline();
    const order: string[] = [];

    pipeline.use(async (ctx, next) => {
      order.push('m1-in');
      await next(ctx);
      order.push('m1-out');
    });

    pipeline.use(async (ctx, next) => {
      order.push('m2-in');
      await next(ctx);
      order.push('m2-out');
    });

    const handler = pipeline.build(async () => {
      order.push('endpoint');
    });

    await handler(createMockContext());

    assert.deepStrictEqual(order, ['m1-in', 'm2-in', 'endpoint', 'm2-out', 'm1-out']);
  });

  test('guards against multiple next() calls in same middleware', async () => {
    const pipeline = new MiddlewarePipeline();

    pipeline.use(async (ctx, next) => {
      await next(ctx);
      // Double call attempt!
      await next(ctx);
    });

    const handler = pipeline.build(async () => {});

    await assert.rejects(
      async () => handler(createMockContext()),
      /Invalid operation: next\(\) was already called/
    );
  });
});
