import { BindingSchema, Infer } from '../binding/types.js';
import { ServiceIdentifier, InjectionToken } from '@tsnx/hosting';
import { HttpContext } from '../http/http-context.js';
import { EndpointArgumentDescriptor } from './types.js';

/**
 * Binds the request body to the specified BindingSchema.
 */
export function body<T extends BindingSchema>(schema: T): EndpointArgumentDescriptor<Infer<T>> {
  return {
    source: 'body',
    resolveAsync: async (ctx: HttpContext) => {
      return await ctx.request.bindBody(schema);
    },
  };
}

/**
 * Resolves a request-scoped or singleton service from the DI container using a constructor, abstract constructor, or typed symbol token (createToken).
 */
export function service<T>(token: InjectionToken<T>): EndpointArgumentDescriptor<T>;
export function service<T = any>(token: ServiceIdentifier<T>): EndpointArgumentDescriptor<T>;
export function service<T>(token: ServiceIdentifier<T>): EndpointArgumentDescriptor<T> {
  return {
    source: 'service',
    resolveAsync: (ctx: HttpContext) => {
      return ctx.services.get(token as any);
    },
  };
}

/**
 * Binds query parameters to the specified BindingSchema.
 */
export function query<T extends BindingSchema>(schema: T): EndpointArgumentDescriptor<Infer<T>> {
  return {
    source: 'query',
    resolveAsync: (ctx: HttpContext) => {
      return ctx.request.bindQuery(schema);
    },
  };
}

/**
 * Binds route parameters to the specified BindingSchema.
 */
export function route<T extends BindingSchema>(schema: T): EndpointArgumentDescriptor<Infer<T>> {
  return {
    source: 'route',
    resolveAsync: (ctx: HttpContext) => {
      return ctx.request.bindRoute(schema);
    },
  };
}

/**
 * Extracts a specific HTTP request header.
 */
export function header(name: string): EndpointArgumentDescriptor<string | undefined> {
  const lower = name.toLowerCase();
  return {
    source: 'header',
    resolveAsync: (ctx: HttpContext) => {
      const val = ctx.request.headers[lower];
      return Array.isArray(val) ? val.join(', ') : val;
    },
  };
}

/**
 * Supplies the current HttpContext instance as an argument.
 */
export function context(): EndpointArgumentDescriptor<HttpContext> {
  return {
    source: 'context',
    resolveAsync: (ctx: HttpContext) => ctx,
  };
}
