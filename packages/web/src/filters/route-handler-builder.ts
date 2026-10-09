import { EndpointFilterPipeline } from './filter-pipeline.js';
import { EndpointFilterType } from './types.js';

/**
 * Builds and configures an endpoint route, including its filters and metadata.
 * Modeled after ASP.NET Core RouteHandlerBuilder.
 */
export class RouteHandlerBuilder {
  private readonly filters: EndpointFilterType[] = [];
  private readonly metadata: Record<string, any> = {};
  private name?: string;
  private displayName?: string;
  private readonly tags: string[] = [];

  constructor(
    public readonly method: string,
    public readonly pattern: string,
  ) {}

  /**
   * Adds an endpoint filter to the route.
   */
  public addEndpointFilter(filter: EndpointFilterType): this {
    this.filters.push(filter);
    return this;
  }

  /**
   * Gets the list of configured endpoint filters for this route.
   */
  public getFilters(): readonly EndpointFilterType[] {
    return this.filters;
  }

  /**
   * Sets the unique endpoint name (e.g. for reverse URL routing or documentation).
   */
  public withName(name: string): this {
    this.name = name;
    return this;
  }

  /**
   * Gets the endpoint name.
   */
  public getName(): string | undefined {
    return this.name;
  }

  /**
   * Sets a human-readable display name for the endpoint.
   */
  public withDisplayName(displayName: string): this {
    this.displayName = displayName;
    return this;
  }

  /**
   * Gets the endpoint display name.
   */
  public getDisplayName(): string | undefined {
    return this.displayName;
  }

  /**
   * Adds tags to the endpoint (e.g. for OpenAPI or documentation grouping).
   */
  public withTags(...tags: string[]): this {
    this.tags.push(...tags);
    return this;
  }

  /**
   * Gets the tags associated with this endpoint.
   */
  public getTags(): readonly string[] {
    return this.tags;
  }

  /**
   * Associates custom metadata with this endpoint.
   */
  public withMetadata(key: string, value: any): this;
  public withMetadata(metadata: Record<string, any>): this;
  public withMetadata(keyOrMetadata: string | Record<string, any>, value?: any): this {
    if (typeof keyOrMetadata === 'string') {
      this.metadata[keyOrMetadata] = value;
    } else if (typeof keyOrMetadata === 'object' && keyOrMetadata !== null) {
      Object.assign(this.metadata, keyOrMetadata);
    }
    return this;
  }

  /**
   * Gets all metadata associated with this endpoint.
   */
  public getMetadata(): Readonly<Record<string, any>> {
    return this.metadata;
  }

  /**
   * Builds an EndpointFilterPipeline for the filters attached to this route.
   */
  public buildFilterPipeline(): EndpointFilterPipeline {
    return new EndpointFilterPipeline(this.filters);
  }
}
