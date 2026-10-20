import type { IServiceProvider, Constructor, ServiceToken } from '@tsnx/hosting';
import { createToken } from '@tsnx/hosting';
import type { RouteHandler } from '../http/results.js';
import type { RouteHandlerBuilder } from '../filters/route-handler-builder.js';
import type { EndpointArgumentDescriptor, InferDescriptors } from '../descriptors/types.js';
import type { RouteGroupBuilder } from '../groups/route-group-builder.js';

/**
 * Abstraction for routing endpoints in TSNX Web applications.
 * Both WebApplication and RouteGroupBuilder implement this interface,
 * allowing endpoints to be mapped either at application root or under route groups.
 * Modeled after ASP.NET Core IEndpointRouteBuilder.
 */
export interface IEndpointRouteBuilder {
  /**
   * Application-level service provider, if built and available.
   */
  readonly services?: IServiceProvider;

  /**
   * Maps a GET endpoint.
   */
  mapGet(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  mapGet<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;

  /**
   * Maps a POST endpoint.
   */
  mapPost(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  mapPost<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;

  /**
   * Maps a PUT endpoint.
   */
  mapPut(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  mapPut<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;

  /**
   * Maps a DELETE endpoint.
   */
  mapDelete(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  mapDelete<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;

  /**
   * Maps a PATCH endpoint.
   */
  mapPatch(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  mapPatch<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;

  /**
   * Maps an endpoint for an arbitrary HTTP method.
   */
  mapEndpoint(
    method: string,
    pattern: string,
    handlerOrDescriptors: RouteHandler | readonly EndpointArgumentDescriptor[],
    maybeHandler?: (...args: any[]) => any,
  ): RouteHandlerBuilder;

  /**
   * Creates a route group with a common path prefix and shared filter/metadata inheritance.
   */
  mapGroup(prefix: string): RouteGroupBuilder;

  /**
   * Maps one or more endpoint classes, instances, or mapping functions.
   * If called with no arguments on WebApplication, maps all endpoints registered in DI.
   */
  mapEndpoints(...endpoints: (EndpointType | readonly EndpointType[])[]): this;

  /**
   * Maps a single endpoint class, instance, or mapping function.
   */
  mapEndpoint(endpoint: EndpointType): this;
}

/**
 * Interface for modular endpoint definitions.
 * Classes implementing this interface define route mappings for a specific feature, domain, or module.
 * Modeled after ASP.NET Core community standard IEndpoint / Carter ICarterModule.
 */
export interface IEndpoint {
  mapEndpoint(app: IEndpointRouteBuilder): void;
}

/**
 * Plural alias for IEndpoint.
 */
export type IEndpoints = IEndpoint;

export type EndpointInstance =
  | IEndpoint
  | { mapEndpoints(app: IEndpointRouteBuilder): void }
  | { map(app: IEndpointRouteBuilder): void };

export type EndpointFunction = (app: IEndpointRouteBuilder) => void;

export type EndpointConstructor = Constructor<EndpointInstance>;

export type EndpointType = EndpointConstructor | EndpointInstance | EndpointFunction;

/**
 * DI Token used to register and resolve endpoints.
 */
export const ENDPOINT_TOKEN: ServiceToken<EndpointType> = createToken<EndpointType>('tsnx.endpoint');
