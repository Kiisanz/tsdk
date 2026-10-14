import { EndpointFilterPipeline } from './filter-pipeline.js';
import { EndpointFilterType } from './types.js';

export class RouteHandlerBuilder {
  private readonly filters: EndpointFilterType[] = [];

  constructor(
    public readonly method: string,
    public readonly pattern: string,
    private readonly app?: any,
  ) {}

  public addEndpointFilter(filter: EndpointFilterType): this {
    this.filters.push(filter);
    return this;
  }

  public getFilters(): readonly EndpointFilterType[] {
    return this.filters;
  }

  public buildFilterPipeline(): EndpointFilterPipeline {
    return new EndpointFilterPipeline(this.filters);
  }

  // Fluent delegation to WebApplication methods if chained
  public mapGet(...args: any[]): RouteHandlerBuilder {
    if (!this.app) throw new Error('WebApplication instance not attached to RouteHandlerBuilder');
    return this.app.mapGet(...args);
  }

  public mapPost(...args: any[]): RouteHandlerBuilder {
    if (!this.app) throw new Error('WebApplication instance not attached to RouteHandlerBuilder');
    return this.app.mapPost(...args);
  }

  public mapPut(...args: any[]): RouteHandlerBuilder {
    if (!this.app) throw new Error('WebApplication instance not attached to RouteHandlerBuilder');
    return this.app.mapPut(...args);
  }

  public mapDelete(...args: any[]): RouteHandlerBuilder {
    if (!this.app) throw new Error('WebApplication instance not attached to RouteHandlerBuilder');
    return this.app.mapDelete(...args);
  }

  public mapPatch(...args: any[]): RouteHandlerBuilder {
    if (!this.app) throw new Error('WebApplication instance not attached to RouteHandlerBuilder');
    return this.app.mapPatch(...args);
  }

  public use(...args: any[]): any {
    if (!this.app) throw new Error('WebApplication instance not attached to RouteHandlerBuilder');
    return this.app.use(...args);
  }
}
