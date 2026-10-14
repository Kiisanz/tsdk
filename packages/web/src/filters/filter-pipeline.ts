import { HttpResult } from '../http/results.js';
import {
  EndpointFilterDelegate,
  EndpointFilterInvocationContext,
  EndpointFilterType,
  IEndpointFilter,
} from './types.js';

export class EndpointFilterPipeline {
  constructor(private readonly filters: readonly EndpointFilterType[]) {}

  public async executeAsync(
    invocationContext: EndpointFilterInvocationContext,
    terminalHandler: (context: EndpointFilterInvocationContext) => Promise<HttpResult | void> | HttpResult | void,
  ): Promise<HttpResult | void> {
    if (this.filters.length === 0) {
      return await terminalHandler(invocationContext);
    }

    let next: EndpointFilterDelegate = terminalHandler;

    for (let i = this.filters.length - 1; i >= 0; i--) {
      const currentFilter = this.filters[i];
      const nextDelegate = next;

      next = async (ctx: EndpointFilterInvocationContext): Promise<HttpResult | void> => {
        let nextCalled = false;
        const guardedNext: EndpointFilterDelegate = async (c = ctx) => {
          if (nextCalled) {
            throw new Error('Invalid operation: next() was already called within this endpoint filter.');
          }
          nextCalled = true;
          return await nextDelegate(c);
        };

        return await this.invokeFilter(ctx, currentFilter, guardedNext);
      };
    }

    return await next(invocationContext);
  }

  private async invokeFilter(
    ctx: EndpointFilterInvocationContext,
    filterItem: EndpointFilterType,
    next: EndpointFilterDelegate,
  ): Promise<HttpResult | void> {
    // 1. Direct object instance with invokeAsync
    if (typeof filterItem === 'object' && filterItem !== null && 'invokeAsync' in filterItem) {
      return await (filterItem as IEndpointFilter).invokeAsync(ctx, next);
    }

    // 2. Class constructor
    if (typeof filterItem === 'function' && isFilterConstructor(filterItem)) {
      let instance: IEndpointFilter | null | undefined;
      if (ctx.httpContext.services) {
        // Resolve via DI directly. If resolution fails (e.g. missing dependency), do NOT catch.
        instance = ctx.httpContext.services.getOptional<IEndpointFilter>(filterItem as any);
      }

      if (instance) {
        return await instance.invokeAsync(ctx, next);
      }

      // If class is not registered in DI, only allow parameterless instantiation.
      // NOTE: Function.length does not count parameters with default values or rest parameters.
      // Classes with dependencies should always be explicitly registered via DI (e.g. builder.services.addScoped) or factory.
      if (filterItem.length > 0) {
        throw new Error(
          `Endpoint filter '${filterItem.name}' has constructor dependencies (expected ${filterItem.length}) but is not registered in the DI container. Register it with 'builder.services.addScoped(${filterItem.name})' or provide a factory.`
        );
      }

      const resolvedInstance: IEndpointFilter = new (filterItem as any)();
      return await resolvedInstance.invokeAsync(ctx, next);
    }

    // 3. Factory function or inline filter function
    if (typeof filterItem === 'function') {
      // Check if it's a factory function (sp) => IEndpointFilter
      // Inline filter functions take (context, next) -> length >= 2
      // Factory functions take (sp) -> length === 1
      if (filterItem.length === 1) {
        const instance = (filterItem as any)(ctx.httpContext.services);
        if (instance && typeof instance.invokeAsync === 'function') {
          return await instance.invokeAsync(ctx, next);
        }
      }

      // Inline filter function (context, next) => ...
      return await (filterItem as any)(ctx, next);
    }

    throw new Error(`Unsupported endpoint filter: ${String(filterItem)}`);
  }
}

function isFilterConstructor(fn: any): fn is new (...args: any[]) => IEndpointFilter {
  if (typeof fn !== 'function') return false;
  if (!fn.prototype) return false;
  if (typeof fn.prototype.invokeAsync === 'function') return true;
  const descriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
  return !descriptor?.writable;
}
