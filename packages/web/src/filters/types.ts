import { HttpContext } from '../http/http-context.js';
import { HttpResult } from '../http/results.js';
import { Constructor, IServiceProvider } from '@tsnx/hosting';

export interface EndpointFilterInvocationContext {
  readonly httpContext: HttpContext;
  readonly arguments: unknown[];
  getArgument<T>(index: number): T;
}

export type EndpointFilterDelegate = (
  context: EndpointFilterInvocationContext,
) => Promise<HttpResult | void> | HttpResult | void;

export type EndpointFilterFn = (
  context: EndpointFilterInvocationContext,
  next: EndpointFilterDelegate,
) => Promise<HttpResult | void> | HttpResult | void;

export interface IEndpointFilter {
  invokeAsync(
    context: EndpointFilterInvocationContext,
    next: EndpointFilterDelegate,
  ): Promise<HttpResult | void> | HttpResult | void;
}

export type EndpointFilterType =
  | Constructor<IEndpointFilter>
  | EndpointFilterFn
  | ((sp: IServiceProvider) => IEndpointFilter)
  | IEndpointFilter;
