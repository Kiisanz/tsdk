import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebApplication } from '../app/web-application.js';
import { Results } from '../http/results.js';
import { ForwardedHeaders } from '../middleware/forwarded-headers.js';

describe('ForwardedHeaders Middleware', () => {
  it('updates request.clientIp, scheme, isHttps, and host from X-Forwarded headers from trusted proxy', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.configureForwardedHeaders((options) => {
      options.forwardedHeaders =
        ForwardedHeaders.XForwardedFor |
        ForwardedHeaders.XForwardedProto |
        ForwardedHeaders.XForwardedHost;
      options.knownNetworks = ['127.0.0.1/32'];
    });

    const app = builder.build();
    app.useForwardedHeaders();

    let capturedClientIp = '';
    let capturedScheme = '';
    let capturedIsHttps = false;
    let capturedHost = '';

    app.mapGet('/proxy-test', (ctx) => {
      capturedClientIp = ctx.request.clientIp;
      capturedScheme = ctx.request.scheme;
      capturedIsHttps = ctx.request.isHttps;
      capturedHost = ctx.request.host;
      return Results.ok({ ok: true });
    });

    await app.start();
    const port = app.listeningPort!;

    try {
      await fetch(`http://127.0.0.1:${port}/proxy-test`, {
        headers: {
          'X-Forwarded-For': '203.0.113.195',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'api.example.com',
        },
      });

      assert.equal(capturedClientIp, '203.0.113.195');
      assert.equal(capturedScheme, 'https');
      assert.equal(capturedIsHttps, true);
      assert.equal(capturedHost, 'api.example.com');
    } finally {
      await app.stop();
    }
  });

  it('handles multiple IPs in X-Forwarded-For taking the client IP closest to user', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.configureForwardedHeaders((options) => {
      options.forwardedHeaders = ForwardedHeaders.XForwardedFor;
      options.knownNetworks = ['127.0.0.1/32', '10.0.0.0/8'];
    });

    const app = builder.build();
    app.useForwardedHeaders();

    let capturedClientIp = '';
    app.mapGet('/multi-ip', (ctx) => {
      capturedClientIp = ctx.request.clientIp;
      return Results.ok({ ok: true });
    });

    await app.start();
    const port = app.listeningPort!;

    try {
      // Client (198.51.100.10) -> LoadBalancer (10.0.0.1) -> Nginx (127.0.0.1)
      await fetch(`http://127.0.0.1:${port}/multi-ip`, {
        headers: {
          'X-Forwarded-For': '198.51.100.10, 10.0.0.1',
        },
      });

      assert.equal(capturedClientIp, '198.51.100.10');
    } finally {
      await app.stop();
    }
  });

  it('rejects forwarded headers if connection remote IP is not trusted', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    builder.configureForwardedHeaders((options) => {
      // Only trust 10.0.0.1, but actual connection comes from 127.0.0.1
      options.knownProxies = ['10.0.0.1'];
      options.knownNetworks = [];
    });

    const app = builder.build();
    app.useForwardedHeaders();

    let capturedClientIp = '';
    let capturedScheme = '';

    app.mapGet('/untrusted', (ctx) => {
      capturedClientIp = ctx.request.clientIp;
      capturedScheme = ctx.request.scheme;
      return Results.ok({ ok: true });
    });

    await app.start();
    const port = app.listeningPort!;

    try {
      await fetch(`http://127.0.0.1:${port}/untrusted`, {
        headers: {
          'X-Forwarded-For': '203.0.113.195',
          'X-Forwarded-Proto': 'https',
        },
      });

      // Headers should not have been applied because 127.0.0.1 is not trusted in this configuration
      assert.notEqual(capturedClientIp, '203.0.113.195');
      assert.equal(capturedScheme, 'http');
    } finally {
      await app.stop();
    }
  });
});
