import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebApplication } from '../app/web-application.js';
import { Results } from '../http/results.js';
import type { IMiddleware } from '../middleware/types.js';
import type { HttpContext } from '../http/http-context.js';
import type { RequestDelegate } from '../middleware/pipeline.js';
import { createToken } from '@tsnx/hosting';

interface IAuditService {
  record(path: string): void;
  getHistory(): string[];
}

const AUDIT_SERVICE = createToken<IAuditService>('IAuditService');

class ScopedAuditService implements IAuditService {
  private history: string[] = [];

  public record(path: string): void {
    this.history.push(path);
  }

  public getHistory(): string[] {
    return this.history;
  }
}

class CustomAuditMiddleware implements IMiddleware {
  constructor(private readonly audit: IAuditService) {}

  public async invoke(ctx: HttpContext, next: RequestDelegate): Promise<void> {
    this.audit.record(ctx.request.path);
    ctx.response.setHeader('X-Audit-Recorded', 'true');
    await next(ctx);
  }
}

describe('IMiddleware & app.useMiddleware DI integration', () => {
  it('resolves class middleware from request scoped services on every request', async () => {
    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });

    // Register scoped audit service
    builder.services.addScoped(AUDIT_SERVICE, () => new ScopedAuditService());

    // Register class middleware with factory
    builder.services.addScoped(CustomAuditMiddleware, (sp) => {
      const audit = sp.get(AUDIT_SERVICE);
      return new CustomAuditMiddleware(audit);
    });

    const app = builder.build();

    // Register using ASP.NET Core-like app.useMiddleware(CustomAuditMiddleware)
    app.useMiddleware(CustomAuditMiddleware);

    app.mapGet('/audit-me', () => Results.json({ message: 'audited' }));

    await app.start();
    const port = app.listeningPort!;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/audit-me`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('X-Audit-Recorded'), 'true');
      const body = await res.json();
      assert.deepEqual(body, { message: 'audited' });
    } finally {
      await app.stop();
    }
  });

  it('throws descriptive error if middleware was not registered in DI container', async () => {
    class UnregisteredMiddleware implements IMiddleware {
      public async invoke(ctx: HttpContext, next: RequestDelegate): Promise<void> {
        await next(ctx);
      }
    }

    const builder = WebApplication.createBuilder();
    builder.configureServer({ port: 0, host: '127.0.0.1' });
    const app = builder.build();

    app.useMiddleware(UnregisteredMiddleware);
    app.mapGet('/hello', () => Results.json({ ok: true }));

    await app.start();
    const port = app.listeningPort!;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/hello`);
      // Global exception handler catches and returns 500 Problem Details
      assert.equal(res.status, 500);
      const problem = (await res.json()) as any;
      assert.ok(problem.title);
    } finally {
      await app.stop();
    }
  });
});
