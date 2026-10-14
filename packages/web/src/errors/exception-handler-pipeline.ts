import { ILogger, IServiceProvider, ServiceDescriptor } from '@tsnx/hosting';
import { HttpContext } from '../http/http-context.js';
import { RequestBindingException } from '../binding/index.js';
import { IExceptionHandler, ExceptionHandlerOptions, BadHttpRequestException } from './types.js';

export type HandlerDescriptorOrType =
  | ServiceDescriptor
  | (new (...args: any[]) => IExceptionHandler)
  | ((sp: IServiceProvider) => IExceptionHandler);

export class ExceptionHandlerPipeline {
  constructor(
    private readonly handlers: readonly HandlerDescriptorOrType[],
    private readonly logger?: ILogger,
    private readonly options: ExceptionHandlerOptions = {}
  ) {}

  public async handleAsync(ctx: HttpContext, error: unknown): Promise<void> {
    // Step 0: Check if response has already started (headers sent)
    if (ctx.response.hasStarted) {
      if (this.logger) {
        this.logger.error(
          `Exception occurred after response headers were already sent for [${ctx.request.method}] ${ctx.request.url}: ${
            error instanceof Error ? error.stack ?? error.message : String(error)
          }`
        );
      }
      if (!ctx.response.raw.writableEnded) {
        ctx.response.raw.destroy(error instanceof Error ? error : undefined);
      }
      return;
    }

    // Step 1: Cancellation Boundary
    // 1.1 Client disconnect / Abort: suppress response and 500 error logging
    const isAbort =
      (ctx.request.signal.aborted && ctx.request.signal.reason?.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError');

    if (isAbort) {
      if (this.logger) {
        this.logger.debug?.(`Request aborted by client: [${ctx.request.method}] ${ctx.request.url}`);
      }
      return;
    }

    // 1.2 Request Execution Timeout: 503 Problem Details
    const isTimeout =
      (ctx.request.signal.aborted && ctx.request.signal.reason?.name === 'TimeoutError') ||
      (error instanceof Error && error.name === 'TimeoutError');

    if (isTimeout) {
      if (this.logger) {
        this.logger.warn(`Request execution timeout: [${ctx.request.method}] ${ctx.request.url}`);
      }
      await ctx.response.writeProblem({
        type: 'https://tsnx.dev/problems/timeout',
        title: 'Service Unavailable',
        status: 503,
        detail: 'The request execution timed out.',
      });
      return;
    }

    // Step 2: Request Binding & Bad HTTP Request Exceptions
    if (error instanceof RequestBindingException) {
      if (this.logger) {
        this.logger.warn?.(`Request binding failed: ${error.message}`);
      }
      await ctx.response.writeProblem(error.toProblemDetails());
      return;
    }

    if (error instanceof BadHttpRequestException) {
      if (this.logger) {
        this.logger.warn?.(`Bad HTTP request (${error.statusCode}): ${error.message}`);
      }
      await ctx.response.writeProblem({
        status: error.statusCode,
        detail: error.message,
      });
      return;
    }

    // Step 3: Custom Exception Handlers Chain (FIFO)
    let handled = false;
    for (const item of this.handlers) {
      let handlerInstance: IExceptionHandler | undefined;
      try {
        handlerInstance = this.resolveHandler(ctx, item);
        if (handlerInstance && typeof handlerInstance.tryHandleAsync === 'function') {
          const result = await handlerInstance.tryHandleAsync(ctx, error);
          if (result === true) {
            handled = true;
            break;
          }
        }
      } catch (handlerErr: unknown) {
        // A custom exception handler threw an error!
        // Robust Failure Handling: Log original error, log handler failure, avoid loops, invoke fallback 500
        if (this.logger) {
          this.logger.error(
            `Original exception during request [${ctx.request.method}] ${ctx.request.url}: ${
              error instanceof Error ? error.stack ?? error.message : String(error)
            }`
          );
          this.logger.error(
            `Exception handler failed while handling error: ${
              handlerErr instanceof Error ? handlerErr.stack ?? handlerErr.message : String(handlerErr)
            }`
          );
        }
        await this.fallbackInternalServerError(ctx, handlerErr);
        return;
      }
    }

    if (handled) {
      return;
    }

    // Step 4: Default Fallback (HTTP 500 Problem Details)
    // IMPORTANT: Do NOT duck-type third-party error.statusCode!
    // Unhandled exceptions are always mapped to HTTP 500.
    if (this.logger) {
      this.logger.error(
        `Unhandled exception processing [${ctx.request.method}] ${ctx.request.url}: ${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }`
      );
    }

    await this.fallbackInternalServerError(ctx, error);
  }

  private resolveHandler(ctx: HttpContext, item: HandlerDescriptorOrType): IExceptionHandler | undefined {
    if (isServiceDescriptor(item)) {
      if (item.instance) {
        return item.instance;
      }
      if (ctx.services) {
        if (item.implementationType) {
          try {
            return ctx.services.get(item.implementationType);
          } catch {
            // If resolution fails via implementationType, try factory or direct
          }
        }
        if (item.factory) {
          return item.factory(ctx.services);
        }
      }
      if (item.implementationType) {
        return new (item.implementationType as any)();
      }
      return undefined;
    }

    // If it's a class or factory function
    if (typeof item === 'function') {
      if (ctx.services) {
        try {
          const fromDi = ctx.services.getOptional<IExceptionHandler>(item as any);
          if (fromDi) return fromDi;
        } catch {
          // Ignore DI lookup error
        }
      }

      if (isConstructor(item)) {
        return new (item as any)();
      } else {
        return (item as any)(ctx.services);
      }
    }

    return undefined;
  }

  private async fallbackInternalServerError(ctx: HttpContext, error: unknown): Promise<void> {
    if (ctx.response.hasStarted || ctx.response.raw.writableEnded) {
      if (!ctx.response.raw.writableEnded) {
        ctx.response.raw.destroy(error instanceof Error ? error : undefined);
      }
      return;
    }

    const detail = this.options.includeDetails
      ? (error instanceof Error ? error.message : String(error))
      : 'An unexpected internal error occurred.';

    await ctx.response.writeProblem({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail,
    });
  }
}

function isServiceDescriptor(item: any): item is ServiceDescriptor {
  return typeof item === 'object' && item !== null && 'token' in item && 'lifetime' in item;
}

function isConstructor(fn: any): fn is new (...args: any[]) => any {
  if (typeof fn !== 'function') return false;
  if (!fn.prototype) return false;
  if (typeof fn.prototype.tryHandleAsync === 'function') return true;
  const descriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
  return !descriptor?.writable;
}
