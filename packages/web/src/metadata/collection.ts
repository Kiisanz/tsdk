import type {
  EndpointMetadataItem,
  ProducesMetadata,
  ProducesProblemMetadata,
} from './types.js';

export class EndpointMetadataCollection {
  private readonly items: EndpointMetadataItem[] = [];

  constructor(initialItems: readonly EndpointMetadataItem[] = []) {
    this.items.push(...initialItems);
  }

  public add(item: EndpointMetadataItem): this {
    this.items.push(item);
    return this;
  }

  public getAll<T extends EndpointMetadataItem['kind']>(
    kind: T,
  ): Extract<EndpointMetadataItem, { kind: T }>[] {
    return this.items.filter(
      (item): item is Extract<EndpointMetadataItem, { kind: T }> => item.kind === kind,
    );
  }

  public get<T extends EndpointMetadataItem['kind']>(
    kind: T,
  ): Extract<EndpointMetadataItem, { kind: T }> | undefined {
    const list = this.getAll(kind);
    return list.length > 0 ? list[list.length - 1] : undefined;
  }

  public getSummary(): string | undefined {
    return this.get('summary')?.text;
  }

  public getDescription(): string | undefined {
    return this.get('description')?.text;
  }

  public getTags(): readonly string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of this.getAll('tags')) {
      for (const tag of item.tags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          result.push(tag);
        }
      }
    }
    return result;
  }

  public getProduces(): readonly (ProducesMetadata | ProducesProblemMetadata)[] {
    return this.items.filter(
      (item): item is ProducesMetadata | ProducesProblemMetadata =>
        item.kind === 'produces' || item.kind === 'produces_problem',
    );
  }

  public getCustom(key: string): any {
    const customItems = this.getAll('custom');
    for (let i = customItems.length - 1; i >= 0; i--) {
      if (customItems[i].key === key) {
        return customItems[i].value;
      }
    }
    return undefined;
  }

  public getItems(): readonly EndpointMetadataItem[] {
    return this.items;
  }
}
