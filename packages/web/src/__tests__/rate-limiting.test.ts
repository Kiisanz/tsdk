import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebApplication } from '../app/web-application.js';
import { Results } from '../http/results.js';

describe('RateLimiter Middleware', () => {
  it('enforces fixed window rate limiting and returns 429 Problem Details with Retry-After', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.addRateLimiter((options) => {
      // 2 requests allowed per 60s
      options.addFixedWindowLimiter('test-limit', {
        permitLimit: 2,
        windowSeconds: 60,
      });
    });

    const app = builder.build();
    app.useRateLimiter();

    app.mapGet('/limited', () => Results.json({ ok: true })).requireRateLimiting('test-limit');

    await app.start();
    const port = app.listeningPort!;

    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/limited`);
      assert.equal(res1.status, 200);

      const res2 = await fetch(`http://127.0.0.1:${port}/limited`);
      assert.equal(res2.status, 200);

      // 3rd request should be rejected with 429
      const res3 = await fetch(`http://127.0.0.1:${port}/limited`);
      assert.equal(res3.status, 429);
      assert.ok(res3.headers.get('Retry-After'));

      const problem = (await res3.json()) as any;
      assert.equal(problem.status, 429);
      assert.equal(problem.title, 'Too Many Requests');
    } finally {
      await app.stop();
    }
  });

  it('supports token bucket rate limiter', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.addRateLimiter((options) => {
      options.addTokenBucketLimiter('bucket', {
        tokenLimit: 2,
        tokensPerPeriod: 1,
        replenishmentPeriodSeconds: 10,
      });
    });

    const app = builder.build();
    app.useRateLimiter();

    app.mapGet('/bucket-test', () => Results.json({ ok: true })).requireRateLimiting('bucket');

    await app.start();
    const port = app.listeningPort!;

    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/bucket-test`);
      assert.equal(res1.status, 200);

      const res2 = await fetch(`http://127.0.0.1:${port}/bucket-test`);
      assert.equal(res2.status, 200);

      const res3 = await fetch(`http://127.0.0.1:${port}/bucket-test`);
      assert.equal(res3.status, 429);
    } finally {
      await app.stop();
    }
  });

  it('supports partition key based on IP / custom partitioner', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.addRateLimiter((options) => {
      // Limit 1 per key
      options.addFixedWindowLimiter('per-user', {
        permitLimit: 1,
        windowSeconds: 60,
        partitionKey: (ctx) => String(ctx.request.headers['x-api-key'] ?? 'anonymous'),
      });
    });

    const app = builder.build();
    app.useRateLimiter();

    app.mapGet('/partition-test', () => Results.json({ ok: true })).requireRateLimiting('per-user');

    await app.start();
    const port = app.listeningPort!;

    try {
      // User A
      const resA1 = await fetch(`http://127.0.0.1:${port}/partition-test`, {
        headers: { 'X-Api-Key': 'user-a' },
      });
      assert.equal(resA1.status, 200);

      const resA2 = await fetch(`http://127.0.0.1:${port}/partition-test`, {
        headers: { 'X-Api-Key': 'user-a' },
      });
      assert.equal(resA2.status, 429);

      // User B should still succeed
      const resB1 = await fetch(`http://127.0.0.1:${port}/partition-test`, {
        headers: { 'X-Api-Key': 'user-b' },
      });
      assert.equal(resB1.status, 200);
    } finally {
      await app.stop();
    }
  });

  it('allows disableRateLimiting on specific endpoints', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.addRateLimiter((options) => {
      // Default policy allows 1 req
      options.addFixedWindowLimiter('__DefaultRateLimitPolicy', {
        permitLimit: 1,
        windowSeconds: 60,
      });
    });

    const app = builder.build();
    app.useRateLimiter();

    app.mapGet('/default-limited', () => Results.json({ ok: true }));
    app.mapGet('/exempt', () => Results.json({ ok: true })).disableRateLimiting();

    await app.start();
    const port = app.listeningPort!;

    try {
      // First hit default
      const res1 = await fetch(`http://127.0.0.1:${port}/default-limited`);
      assert.equal(res1.status, 200);

      const res2 = await fetch(`http://127.0.0.1:${port}/default-limited`);
      assert.equal(res2.status, 429);

      // Exempt route should not be limited
      const res3 = await fetch(`http://127.0.0.1:${port}/exempt`);
      assert.equal(res3.status, 200);
      const res4 = await fetch(`http://127.0.0.1:${port}/exempt`);
      assert.equal(res4.status, 200);
    } finally {
      await app.stop();
    }
  });
});
