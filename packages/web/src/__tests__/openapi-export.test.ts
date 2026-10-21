import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WebApplication, Results } from '../index.js';

describe('WebApplication exportOpenApi', () => {
  let app: WebApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = undefined;
    }
  });

  test('exports OpenAPI document programmatically via app.exportOpenApi(outputPath)', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    app = builder.build();

    app.mapGet('/api/products', () => Results.json([])).withName('listProducts').withTags('Products');
    app.mapPost('/api/products', () => Results.created({ id: 1 })).withName('createProduct').withTags('Products');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-web-openapi-'));
    const outputPath = path.join(tmpDir, 'openapi.json');

    try {
      await app.exportOpenApi(outputPath);

      assert.ok(fs.existsSync(outputPath));
      const content = fs.readFileSync(outputPath, 'utf-8');
      const doc = JSON.parse(content);

      assert.strictEqual(doc.openapi, '3.1.0');
      assert.ok(doc.paths['/api/products']);
      assert.ok(doc.paths['/api/products'].get);
      assert.strictEqual(doc.paths['/api/products'].get.operationId, 'listProducts');
      assert.deepStrictEqual(doc.paths['/api/products'].get.tags, ['Products']);
      assert.ok(doc.paths['/api/products'].post);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('app.run() exports OpenAPI and exits early without binding server port when TSNX_OPENAPI_EXPORT is set', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsnx-web-openapi-env-'));
    const outputPath = path.join(tmpDir, 'exported-env.json');

    process.env.TSNX_OPENAPI_EXPORT = outputPath;

    try {
      const builder = WebApplication.createBuilder();
      builder.configureServer({ port: 0, host: '127.0.0.1' });
      app = builder.build();

      app.mapGet('/health', () => Results.ok({ status: 'healthy' })).withName('healthCheck');

      // Should export and return without hanging or binding port
      await app.run();

      assert.ok(fs.existsSync(outputPath));
      const doc = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      assert.ok(doc.paths['/health']);
      assert.strictEqual(doc.paths['/health'].get.operationId, 'healthCheck');
      // Server listening port should NOT be set because server never listened
      assert.strictEqual(app.listeningPort, undefined);
    } finally {
      delete process.env.TSNX_OPENAPI_EXPORT;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
