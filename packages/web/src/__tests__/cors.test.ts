import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebApplication } from '../app/web-application.js';
import { Results } from '../http/results.js';

describe('CORS Middleware', () => {
  it('handles preflight OPTIONS request with 204 No Content and proper headers', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.addCors((options) => {
      options.addDefaultPolicy((policy) => {
        policy
          .withOrigins('https://example.com')
          .withMethods('GET', 'POST', 'PUT')
          .withHeaders('Content-Type', 'Authorization')
          .setPreflightMaxAge(3600);
      });
    });

    const app = builder.build();
    app.useCors();

    app.mapPost('/api/data', () => Results.json({ status: 'created' }));

    await app.start();
    const port = app.listeningPort!;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/data`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
      assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT');
      assert.equal(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase(), 'content-type, authorization');
      assert.equal(res.headers.get('Access-Control-Max-Age'), '3600');
    } finally {
      await app.stop();
    }
  });

  it('reflects origin and sets Vary: Origin when allowCredentials is enabled with allowAnyOrigin', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.addCors((options) => {
      options.addDefaultPolicy((policy) => {
        policy
          .allowAnyOrigin()
          .allowAnyMethod()
          .allowAnyHeader()
          .allowCredentials();
      });
    });

    const app = builder.build();
    app.useCors();

    app.mapGet('/api/profile', () => Results.json({ user: 'alice' }));

    await app.start();
    const port = app.listeningPort!;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/profile`, {
        headers: {
          Origin: 'https://app.client.com',
        },
      });

      assert.equal(res.status, 200);
      // Per CORS spec: when credentials are allowed, origin must NEVER be '*'
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://app.client.com');
      assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true');
      assert.equal(res.headers.get('Vary'), 'Origin');
    } finally {
      await app.stop();
    }
  });

  it('supports endpoint-specific policies using requireCors and disableCors', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.addCors((options) => {
      options.addDefaultPolicy((policy) => {
        policy.withOrigins('https://default.com');
      });
      options.addPolicy('CustomPolicy', (policy) => {
        policy.withOrigins('https://custom.com');
      });
    });

    const app = builder.build();
    app.useCors();

    app.mapGet('/default-cors', () => Results.json({ route: 'default' }));
    app.mapGet('/custom-cors', () => Results.json({ route: 'custom' })).requireCors('CustomPolicy');
    app.mapGet('/no-cors', () => Results.json({ route: 'none' })).disableCors();

    await app.start();
    const port = app.listeningPort!;

    try {
      // 1. Default endpoint with default origin
      const res1 = await fetch(`http://127.0.0.1:${port}/default-cors`, {
        headers: { Origin: 'https://default.com' },
      });
      assert.equal(res1.headers.get('Access-Control-Allow-Origin'), 'https://default.com');

      // 2. Custom endpoint with custom origin
      const res2 = await fetch(`http://127.0.0.1:${port}/custom-cors`, {
        headers: { Origin: 'https://custom.com' },
      });
      assert.equal(res2.headers.get('Access-Control-Allow-Origin'), 'https://custom.com');

      // 3. Custom endpoint with default origin (should NOT be allowed)
      const res3 = await fetch(`http://127.0.0.1:${port}/custom-cors`, {
        headers: { Origin: 'https://default.com' },
      });
      assert.equal(res3.headers.get('Access-Control-Allow-Origin'), null);

      // 4. Disabled CORS endpoint
      const res4 = await fetch(`http://127.0.0.1:${port}/no-cors`, {
        headers: { Origin: 'https://default.com' },
      });
      assert.equal(res4.headers.get('Access-Control-Allow-Origin'), null);
    } finally {
      await app.stop();
    }
  });
});
