export interface SummaryMetadata {
  readonly kind: 'summary';
  readonly text: string;
}

export interface DescriptionMetadata {
  readonly kind: 'description';
  readonly text: string;
}

export interface TagsMetadata {
  readonly kind: 'tags';
  readonly tags: readonly string[];
}

export interface ProducesMetadata {
  readonly kind: 'produces';
  readonly statusCode: number;
  readonly schema?: any;
  readonly contentType: string;
}

export interface ProducesProblemMetadata {
  readonly kind: 'produces_problem';
  readonly statusCode: number;
  readonly contentType: string;
}

export interface CustomMetadata {
  readonly kind: 'custom';
  readonly key: string;
  readonly value: any;
}

export type EndpointMetadataItem =
  | SummaryMetadata
  | DescriptionMetadata
  | TagsMetadata
  | ProducesMetadata
  | ProducesProblemMetadata
  | CustomMetadata;
