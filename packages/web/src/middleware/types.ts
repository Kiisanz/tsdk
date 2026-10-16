import type { HttpContext } from '../http/http-context.js';
import type { RequestDelegate } from './pipeline.js';

/**
 * Defines middleware that can be added to the application's request pipeline,
 * modeled after ASP.NET Core's IMiddleware interface.
 */
export interface IMiddleware {
  invoke(ctx: HttpContext, next: RequestDelegate): Promise<void>;
}

export type MiddlewareConstructor<T extends IMiddleware = IMiddleware> = new (...args: any[]) => T;
