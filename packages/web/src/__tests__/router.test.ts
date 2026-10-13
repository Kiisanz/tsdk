import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../routing/router.js';
import { Results } from '../http/results.js';

describe('Router', () => {
  test('matches static routes with highest priority over parameter routes', () => {
    const router = new Router();
    router.get('/users/profile', () => Results.text('static-profile'));
    router.get('/users/:id', (ctx) => Results.text(`user-${ctx.params.id}`));

    const staticMatch = router.match('GET', '/users/profile');
    assert.strictEqual(staticMatch.type, 'match');
    if (staticMatch.type === 'match') {
      assert.deepStrictEqual(staticMatch.match.params, {});
    }

    const paramMatch = router.match('GET', '/users/123');
    assert.strictEqual(paramMatch.type, 'match');
    if (paramMatch.type === 'match') {
      assert.deepStrictEqual(paramMatch.match.params, { id: '123' });
    }
  });

  test('correctly decodes URL-encoded parameters', () => {
    const router = new Router();
    router.get('/search/:query', (ctx) => Results.text(ctx.params.query));

    const result = router.match('GET', '/search/hello%20world%21');
    assert.strictEqual(result.type, 'match');
    if (result.type === 'match') {
      assert.strictEqual(result.match.params.query, 'hello world!');
    }
  });

  test('returns bad_request on malformed URL encoding', () => {
    const router = new Router();
    router.get('/files/:name', (ctx) => Results.text(ctx.params.name));

    const result = router.match('GET', '/files/%E0%A4%A');
    assert.strictEqual(result.type, 'bad_request');
  });

  test('returns 404 for unmatched paths', () => {
    const router = new Router();
    router.get('/items', () => Results.ok());

    const result = router.match('GET', '/other');
    assert.strictEqual(result.type, 'not_found');
  });

  test('returns 405 Method Not Allowed with Allow list when path matches but method differs', () => {
    const router = new Router();
    router.get('/items', () => Results.ok());
    router.post('/items', () => Results.ok());

    const result = router.match('DELETE', '/items');
    assert.strictEqual(result.type, 'method_not_allowed');
    if (result.type === 'method_not_allowed') {
      // GET implicitly includes HEAD and OPTIONS
      assert.deepStrictEqual(result.allowedMethods.sort(), ['GET', 'HEAD', 'OPTIONS', 'POST'].sort());
    }
  });

  test('automatically falls back HEAD to GET when not explicitly registered', () => {
    const router = new Router();
    router.get('/data', () => Results.text('get-data'));

    const result = router.match('HEAD', '/data');
    assert.strictEqual(result.type, 'match');
    if (result.type === 'match') {
      assert.strictEqual(result.match.isHeadAuto, true);
    }
  });

  test('automatically responds to OPTIONS with allowed methods', () => {
    const router = new Router();
    router.get('/data', () => Results.ok());
    router.post('/data', () => Results.ok());

    const result = router.match('OPTIONS', '/data');
    assert.strictEqual(result.type, 'options');
    if (result.type === 'options') {
      assert.deepStrictEqual(result.allowedMethods.sort(), ['GET', 'HEAD', 'OPTIONS', 'POST'].sort());
    }
  });

  test('throws error on duplicate method and pattern registration', () => {
    const router = new Router();
    router.get('/orders', () => Results.ok());

    assert.throws(
      () => router.get('/orders', () => Results.ok()),
      /Duplicate route registration/
    );
  });
});
