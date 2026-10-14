import { EndpointFilterType } from '../filters/types.js';
import { RouteHandlerBuilder } from '../filters/route-handler-builder.js';
import { RouteHandler } from '../http/results.js';
import { EndpointArgumentDescriptor, InferDescriptors } from '../descriptors/types.js';
import type { EndpointMetadataItem } from '../metadata/types.js';

export function combinePaths(base: string, relative: string): string {
  const normBase = base.startsWith('/') ? base : `/${base}`;
  const cleanBase = normBase.endsWith('/') ? normBase.slice(0, -1) : normBase;
  const normRel = relative.startsWith('/') ? relative : `/${relative}`;
  const combined = `${cleanBase}${normRel}`;
  return combined === '' ? '/' : combined.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

export class RouteGroupBuilder {
  private readonly filters: EndpointFilterType[] = [];
  private readonly metadataItems: EndpointMetadataItem[] = [];

  constructor(
    public readonly prefix: string,
    public readonly parent?: RouteGroupBuilder,
    private readonly app?: any,
  ) {}

  public getApp(): any {
    return this.app ?? this.parent?.getApp();
  }

  /**
   * Adds an endpoint filter that applies to all endpoints in this group and child groups.
   */
  public addEndpointFilter(filter: EndpointFilterType): this {
    this.filters.push(filter);
    return this;
  }

  public getFilters(): readonly EndpointFilterType[] {
    return this.filters;
  }

  /**
   * Sets tags that will be inherited by all endpoints in this group.
   */
  public withTags(...tags: string[]): this {
    this.metadataItems.push({ kind: 'tags', tags });
    return this;
  }

  /**
   * Sets a default summary for endpoints in this group (can be overridden by endpoints).
   */
  public withSummary(summary: string): this {
    this.metadataItems.push({ kind: 'summary', text: summary });
    return this;
  }

  /**
   * Sets a default description for endpoints in this group (can be overridden by endpoints).
   */
  public withDescription(description: string): this {
    this.metadataItems.push({ kind: 'description', text: description });
    return this;
  }

  /**
   * Declares a response that endpoints in this group produce by default.
   */
  public produces(statusCode: number, schema?: any, contentType = 'application/json'): this {
    this.metadataItems.push({ kind: 'produces', statusCode, schema, contentType });
    return this;
  }

  /**
   * Declares an RFC 9457 problem response that endpoints in this group produce.
   */
  public producesProblem(statusCode: number, contentType = 'application/problem+json'): this {
    this.metadataItems.push({ kind: 'produces_problem', statusCode, contentType });
    return this;
  }

  /**
   * Associates custom metadata with this route group.
   */
  public withMetadata(key: string, value: any): this;
  public withMetadata(metadata: Record<string, any>): this;
  public withMetadata(item: EndpointMetadataItem): this;
  public withMetadata(keyOrMetadata: string | Record<string, any> | EndpointMetadataItem, value?: any): this {
    if (typeof keyOrMetadata === 'string') {
      this.metadataItems.push({ kind: 'custom', key: keyOrMetadata, value });
    } else if (typeof keyOrMetadata === 'object' && keyOrMetadata !== null) {
      if ('kind' in keyOrMetadata) {
        this.metadataItems.push(keyOrMetadata as EndpointMetadataItem);
      } else {
        for (const [k, v] of Object.entries(keyOrMetadata)) {
          this.metadataItems.push({ kind: 'custom', key: k, value: v });
        }
      }
    }
    return this;
  }

  public getMetadataItems(): readonly EndpointMetadataItem[] {
    return this.metadataItems;
  }

  /**
   * Creates a nested route sub-group with concatenated path prefix.
   */
  public mapGroup(prefix: string): RouteGroupBuilder {
    const fullPrefix = combinePaths(this.prefix, prefix);
    return new RouteGroupBuilder(fullPrefix, this, this.getApp());
  }

  /**
   * Maps a GET endpoint under this group.
   */
  public mapGet(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  public mapGet<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;
  public mapGet(
    pattern: string,
    handlerOrDescriptors: RouteHandler | readonly EndpointArgumentDescriptor[],
    maybeHandler?: (...args: any[]) => any,
  ): RouteHandlerBuilder {
    return this.mapEndpoint('GET', pattern, handlerOrDescriptors, maybeHandler);
  }

  /**
   * Maps a POST endpoint under this group.
   */
  public mapPost(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  public mapPost<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;
  public mapPost(
    pattern: string,
    handlerOrDescriptors: RouteHandler | readonly EndpointArgumentDescriptor[],
    maybeHandler?: (...args: any[]) => any,
  ): RouteHandlerBuilder {
    return this.mapEndpoint('POST', pattern, handlerOrDescriptors, maybeHandler);
  }

  /**
   * Maps a PUT endpoint under this group.
   */
  public mapPut(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  public mapPut<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;
  public mapPut(
    pattern: string,
    handlerOrDescriptors: RouteHandler | readonly EndpointArgumentDescriptor[],
    maybeHandler?: (...args: any[]) => any,
  ): RouteHandlerBuilder {
    return this.mapEndpoint('PUT', pattern, handlerOrDescriptors, maybeHandler);
  }

  /**
   * Maps a DELETE endpoint under this group.
   */
  public mapDelete(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  public mapDelete<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;
  public mapDelete(
    pattern: string,
    handlerOrDescriptors: RouteHandler | readonly EndpointArgumentDescriptor[],
    maybeHandler?: (...args: any[]) => any,
  ): RouteHandlerBuilder {
    return this.mapEndpoint('DELETE', pattern, handlerOrDescriptors, maybeHandler);
  }

  /**
   * Maps a PATCH endpoint under this group.
   */
  public mapPatch(pattern: string, handler: RouteHandler): RouteHandlerBuilder;
  public mapPatch<const T extends readonly EndpointArgumentDescriptor[]>(
    pattern: string,
    descriptors: T,
    handler: (...args: InferDescriptors<T>) => any,
  ): RouteHandlerBuilder;
  public mapPatch(
    pattern: string,
    handlerOrDescriptors: RouteHandler | readonly EndpointArgumentDescriptor[],
    maybeHandler?: (...args: any[]) => any,
  ): RouteHandlerBuilder {
    return this.mapEndpoint('PATCH', pattern, handlerOrDescriptors, maybeHandler);
  }

  private mapEndpoint(
    method: string,
    pattern: string,
    handlerOrDescriptors: RouteHandler | readonly EndpointArgumentDescriptor[],
    maybeHandler?: (...args: any[]) => any,
  ): RouteHandlerBuilder {
    const app = this.getApp();
    if (!app) {
      throw new Error(`WebApplication instance is not attached to RouteGroup '${this.prefix}'.`);
    }
    const fullPath = combinePaths(this.prefix, pattern);
    // Delegate to app with parentGroup attached
    return app.mapEndpoint(method, fullPath, handlerOrDescriptors, maybeHandler, this);
  }
}
