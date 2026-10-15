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
    if (
      ctx.request.signal.aborted ||
      (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
    ) {
      await this.handleCancellationBoundary(ctx, error);
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
      // Invariant 1: Ensure custom handler does not proceed if request was cancelled
      if (ctx.request.signal.aborted) {
        await this.handleCancellationBoundary(ctx);
        return;
      }

      let handlerInstance: IExceptionHandler | undefined;
      const startedBefore = ctx.response.hasStarted;
      const statusBefore = ctx.response.statusCode;
      // Deep snapshot of headers (cloning arrays to prevent in-place mutation bypass)
      const headersBefore: Record<string, string | number | string[] | undefined> = {};
      for (const [name, val] of Object.entries(ctx.response.raw.getHeaders())) {
        headersBefore[name] = Array.isArray(val) ? [...val] : val;
      }

      const restoreResponseState = () => {
        if (ctx.response.hasStarted) return;
        // 1. Remove all headers currently present on response
        for (const name of ctx.response.raw.getHeaderNames()) {
          ctx.response.removeHeader(name);
        }
        // 2. Re-apply the exact snapshot of original headers
        for (const [name, val] of Object.entries(headersBefore)) {
          if (val !== undefined) {
            ctx.response.setHeader(name, Array.isArray(val) ? [...val] : (val as any));
          }
        }
        // 3. Restore status code
        ctx.response.statusCode = statusBefore;
      };

      try {
        handlerInstance = this.resolveHandler(ctx, item);
        if (handlerInstance && typeof handlerInstance.tryHandleAsync === 'function') {
          const result = await handlerInstance.tryHandleAsync(ctx, error);

          // Invariant 1: Custom handler must not swallow cancellation!
          // If request was cancelled before or during handler execution, framework must uphold cancellation decision.
          if (ctx.request.signal.aborted) {
            if (this.logger) {
              this.logger.debug?.(
                `Cancellation occurred during or before ExceptionHandler '${handlerInstance.constructor.name}'. Preserving cancellation decision.`
              );
            }
            await this.handleCancellationBoundary(ctx);
            return;
          }

          if (result === true) {
            handled = true;
            break;
          }

          // Invariant 2: tryHandleAsync() returning false MUST NOT modify the response!
          if (result === false) {
            if (ctx.response.hasStarted && !startedBefore) {
              const violationMsg = `ExceptionHandler '${handlerInstance.constructor.name}' violated contract: response was started (headers sent) but returned false. Handlers returning false must not modify the response.`;
              if (this.logger) {
                this.logger.error(violationMsg);
              }
              if (!ctx.response.raw.writableEnded) {
                ctx.response.raw.destroy(new Error(violationMsg));
              }
              return;
            }

            // Restore complete response state (status + all original headers)
            restoreResponseState();
          }
        }
      } catch (handlerErr: unknown) {
        // Restore response state before falling back so handler mutations don't pollute fallback 500
        restoreResponseState();

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

  private async handleCancellationBoundary(ctx: HttpContext, error?: unknown): Promise<void> {
    const isAbort =
      (ctx.request.signal.aborted && ctx.request.signal.reason?.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError');

    if (isAbort) {
      if (this.logger) {
        this.logger.debug?.(`Request aborted by client: [${ctx.request.method}] ${ctx.request.url}`);
      }
      if (!ctx.response.raw.writableEnded) {
        ctx.response.raw.destroy(error instanceof Error ? error : ctx.request.signal.reason);
      }
      return;
    }

    const isTimeout =
      (ctx.request.signal.aborted && ctx.request.signal.reason?.name === 'TimeoutError') ||
      (error instanceof Error && error.name === 'TimeoutError');

    if (isTimeout) {
      if (this.logger) {
        this.logger.warn(`Request execution timeout: [${ctx.request.method}] ${ctx.request.url}`);
      }
      if (!ctx.response.hasStarted && !ctx.response.raw.writableEnded) {
        ctx.response.raw.statusCode = 503;
        ctx.response.raw.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
        ctx.response.raw.end(
          JSON.stringify({
            type: 'https://tsnx.dev/problems/timeout',
            title: 'Service Unavailable',
            status: 503,
            detail: 'The request execution timed out.',
          })
        );
      } else if (!ctx.response.raw.writableEnded) {
        ctx.response.raw.destroy(error instanceof Error ? error : ctx.request.signal.reason);
      }
      return;
    }
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
          const instance = item.factory(ctx.services);
          if (instance && (ctx.services as any).ownedInstances && !(ctx.services as any).ownedInstances.includes(instance)) {
            (ctx.services as any).ownedInstances.push(instance);
          }
          return instance;
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
