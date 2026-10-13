import { HttpContext } from '../http/http-context.js';
import { RequestDelegate } from './pipeline.js';
import { ILogger } from '@tsdk/hosting';

export interface ErrorHandlerOptions {
  includeDetails?: boolean;
}

export function createExceptionHandlerMiddleware(logger?: ILogger, options: ErrorHandlerOptions = {}) {
  return async (ctx: HttpContext, next: RequestDelegate): Promise<void> => {
    try {
      await next(ctx);
    } catch (err: any) {
      if (logger) {
        logger.error(`Unhandled exception processing ${ctx.request.method} ${ctx.request.url}: ${err?.stack || err?.message || err}`);
      }

      // Check if response has already started (headers sent)
      if (ctx.response.hasStarted) {
        if (!ctx.response.raw.writableEnded) {
          ctx.response.raw.destroy(err);
        }
        return;
      }

      const statusCode = typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;

      const title = statusCode === 400
        ? 'Bad Request'
        : statusCode === 404
        ? 'Not Found'
        : statusCode === 413
        ? 'Payload Too Large'
        : 'Internal Server Error';

      ctx.response.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
      const body: Record<string, any> = {
        title,
        status: statusCode,
        detail: options.includeDetails || statusCode < 500 ? (err?.message || 'An error occurred') : 'An unexpected internal error occurred.',
      };

      await ctx.response.writeJson(body, statusCode);
    }
  };
}
