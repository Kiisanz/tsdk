import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebApplication, Results } from '@tsnx/web';
import { mapScalarApiReference, renderScalarPage } from '../index.js';

describe('Milestone 06: @tsnx/scalar Interactive API Reference', () => {
  let app: WebApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = undefined;
    }
  });

  test('renderScalarPage outputs valid HTML embedding CDN and configuration', () => {
    const defaultHtml = renderScalarPage();
    assert.ok(defaultHtml.includes('<!doctype html>'));
    assert.ok(defaultHtml.includes('<title>TSNX API Reference</title>'));
    assert.ok(defaultHtml.includes('data-url="/openapi/v1.json"'));
    assert.ok(defaultHtml.includes('https://cdn.jsdelivr.net/npm/@scalar/api-reference'));
    assert.ok(defaultHtml.includes('"theme":"default"'));

    const customHtml = renderScalarPage({
      title: 'Acme API Docs',
      openApiRoute: '/spec/v1.json',
      theme: 'purple',
      customCss: '.custom-header { display: none; }',
    });
    assert.ok(customHtml.includes('<title>Acme API Docs</title>'));
    assert.ok(customHtml.includes('data-url="/spec/v1.json"'));
    assert.ok(customHtml.includes('"theme":"purple"'));
    assert.ok(customHtml.includes('.custom-header { display: none; }'));
  });

  test('mapScalarApiReference serves HTML UI at default endpoint /scalar/v1', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/health', () => Results.text('ok'));
    mapScalarApiReference(app);

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/scalar/v1`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));

    const body = await res.text();
    assert.ok(body.includes('<!doctype html>'));
    assert.ok(body.includes('data-url="/openapi/v1.json"'));
    assert.ok(body.includes('@scalar/api-reference'));
  });

  test('app.mapScalarApiReference with custom endpoint and options via chaining', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    // Prototype method chaining
    app.mapScalarApiReference({
      endpoint: '/docs',
      openApiRoute: '/openapi/custom.json',
      title: 'Portal API Reference',
      theme: 'moon',
    });

    await app.start();
    const port = app.listeningPort;

    const res = await fetch(`http://127.0.0.1:${port}/docs`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));

    const body = await res.text();
    assert.ok(body.includes('<title>Portal API Reference</title>'));
    assert.ok(body.includes('data-url="/openapi/custom.json"'));
    assert.ok(body.includes('"theme":"moon"'));
  });
});
