import { EndpointFilterPipeline } from './filter-pipeline.js';
import { EndpointFilterType } from './types.js';
import { RouteGroupBuilder } from '../groups/route-group-builder.js';
import type {
  EndpointMetadataItem,
  ProducesMetadata,
  ProducesProblemMetadata,
} from '../metadata/types.js';
import { EndpointMetadataCollection } from '../metadata/collection.js';
import { ENABLE_CORS_KEY, DISABLE_CORS_KEY } from '../cors/types.js';
import { ENABLE_RATE_LIMITING_KEY, DISABLE_RATE_LIMITING_KEY } from '../rate-limiting/types.js';


/**
 * Builds and configures an endpoint route, including its filters and structured metadata.
 * Modeled after ASP.NET Core RouteHandlerBuilder.
 */
export class RouteHandlerBuilder {
  private readonly filters: EndpointFilterType[] = [];
  private readonly metadataItems: EndpointMetadataItem[] = [];
  private name?: string;
  private displayName?: string;

  constructor(
    public readonly method: string,
    public readonly pattern: string,
    public readonly parentGroup?: RouteGroupBuilder,
  ) {}

  /**
   * Adds an endpoint filter to this route.
   */
  public addEndpointFilter(filter: EndpointFilterType): this {
    this.filters.push(filter);
    return this;
  }

  /**
   * Gets the list of configured endpoint filters for this route (excluding parent group filters).
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
   * Sets a concise summary for the endpoint (overrides any group-level summary).
   */
  public withSummary(summary: string): this {
    this.metadataItems.push({ kind: 'summary', text: summary });
    return this;
  }

  /**
   * Sets a detailed description for the endpoint (overrides any group-level description).
   */
  public withDescription(description: string): this {
    this.metadataItems.push({ kind: 'description', text: description });
    return this;
  }

  /**
   * Adds tags to the endpoint (inherits and appends to parent group tags).
   */
  public withTags(...tags: string[]): this {
    this.metadataItems.push({ kind: 'tags', tags });
    return this;
  }

  /**
   * Declares a response that this endpoint produces.
   */
  public produces(statusCode: number, schema?: any, contentType = 'application/json'): this {
    this.metadataItems.push({ kind: 'produces', statusCode, schema, contentType });
    return this;
  }

  /**
   * Declares an RFC 9457 problem response that this endpoint produces.
   */
  public producesProblem(statusCode: number, contentType = 'application/problem+json'): this {
    this.metadataItems.push({ kind: 'produces_problem', statusCode, contentType });
    return this;
  }

  /**
   * Associates custom metadata or typed metadata items with this endpoint.
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

  /**
   * Gets the list of raw metadata items directly declared on this endpoint.
   */
  public getMetadataItems(): readonly EndpointMetadataItem[] {
    return this.metadataItems;
  }

  /**
   * Gets the compiled tags for this endpoint.
   */
  public getTags(): readonly string[] {
    return this.buildEffectiveMetadata().getTags();
  }

  /**
   * Gets custom metadata dictionary for this endpoint.
   */
  public getMetadata(): Readonly<Record<string, any>> {
    const meta: Record<string, any> = {};
    for (const item of this.buildEffectiveMetadata().getItems()) {
      if (item.kind === 'custom') {
        meta[item.key] = item.value;
      }
    }
    return meta;
  }

  /**
   * Compiles the effective list of endpoint filters in deterministic FIFO onion order:
   * Parent Group Filters -> Child Group Filters -> Endpoint Filters.
   */
  public buildEffectiveFilters(): readonly EndpointFilterType[] {
    const groupChain: RouteGroupBuilder[] = [];
    let currentGroup = this.parentGroup;
    while (currentGroup) {
      groupChain.unshift(currentGroup);
      currentGroup = currentGroup.parent;
    }

    const effective: EndpointFilterType[] = [];
    for (const group of groupChain) {
      effective.push(...group.getFilters());
    }
    effective.push(...this.filters);
    return effective;
  }

  /**
   * Compiles the effective metadata collection, applying explicit inheritance rules:
   * - Tags: Accumulate from parent groups to endpoint in order, deduplicated.
   * - Summary: Endpoint overrides group (child group overrides parent group).
   * - Description: Endpoint overrides group (child group overrides parent group).
   * - Produces: Accumulate from parent groups to endpoint.
   * - Custom: Merged from parent groups down to endpoint.
   */
  public buildEffectiveMetadata(): EndpointMetadataCollection {
    const groupChain: RouteGroupBuilder[] = [];
    let currentGroup = this.parentGroup;
    while (currentGroup) {
      groupChain.unshift(currentGroup);
      currentGroup = currentGroup.parent;
    }

    const collection = new EndpointMetadataCollection();

    // 1. Gather all raw items in order from root group to endpoint
    const allRawItems: EndpointMetadataItem[] = [];
    for (const group of groupChain) {
      allRawItems.push(...group.getMetadataItems());
    }
    allRawItems.push(...this.metadataItems);

    // 2. Accumulate tags (parent -> child -> endpoint, deduplicated)
    const seenTags = new Set<string>();
    const tagsList: string[] = [];
    for (const item of allRawItems) {
      if (item.kind === 'tags') {
        for (const tag of item.tags) {
          if (!seenTags.has(tag)) {
            seenTags.add(tag);
            tagsList.push(tag);
          }
        }
      }
    }
    if (tagsList.length > 0) {
      collection.add({ kind: 'tags', tags: tagsList });
    }

    // 3. Resolve summary: endpoint overrides child group overrides parent group
    let resolvedSummary: string | undefined;
    for (const item of allRawItems) {
      if (item.kind === 'summary') {
        resolvedSummary = item.text;
      }
    }
    if (resolvedSummary !== undefined) {
      collection.add({ kind: 'summary', text: resolvedSummary });
    }

    // 4. Resolve description: endpoint overrides child group overrides parent group
    let resolvedDescription: string | undefined;
    for (const item of allRawItems) {
      if (item.kind === 'description') {
        resolvedDescription = item.text;
      }
    }
    if (resolvedDescription !== undefined) {
      collection.add({ kind: 'description', text: resolvedDescription });
    }

    // 5. Accumulate produces and produces_problem
    const producesMap = new Map<string, ProducesMetadata | ProducesProblemMetadata>();
    for (const item of allRawItems) {
      if (item.kind === 'produces' || item.kind === 'produces_problem') {
        const key = `${item.statusCode}:${item.contentType}`;
        producesMap.set(key, item);
      }
    }
    for (const p of producesMap.values()) {
      collection.add(p);
    }

    // 6. Custom metadata
    for (const item of allRawItems) {
      if (item.kind === 'custom') {
        collection.add(item);
      }
    }

    return collection;
  }

  /**
   * Requires CORS on this endpoint, optionally specifying a named policy.
   * Modeled after ASP.NET Core [EnableCors] / .RequireCors().
   */
  public requireCors(policyName?: string): this {
    this.withMetadata(ENABLE_CORS_KEY, { policyName });
    return this;
  }

  /**
   * Disables CORS on this endpoint.
   * Modeled after ASP.NET Core [DisableCors] / .DisableCors().
   */
  public disableCors(): this {
    this.withMetadata(DISABLE_CORS_KEY, { disabled: true });
    return this;
  }

  /**
   * Requires rate limiting on this endpoint, optionally specifying a named policy.
   * Modeled after ASP.NET Core [EnableRateLimiting] / .RequireRateLimiting().
   */
  public requireRateLimiting(policyName?: string): this {
    this.withMetadata(ENABLE_RATE_LIMITING_KEY, { policyName });
    return this;
  }

  /**
   * Disables rate limiting on this endpoint.
   * Modeled after ASP.NET Core [DisableRateLimiting] / .DisableRateLimiting().
   */
  public disableRateLimiting(): this {
    this.withMetadata(DISABLE_RATE_LIMITING_KEY, { disabled: true });
    return this;
  }

  /**
   * Builds an EndpointFilterPipeline for the effective filters attached to this route.
   */
  public buildFilterPipeline(): EndpointFilterPipeline {
    return new EndpointFilterPipeline(this.buildEffectiveFilters());
  }
}
