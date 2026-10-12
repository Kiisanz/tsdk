import { HttpContext } from '../http/http-context.js';

export type ArgumentSource = 'body' | 'service' | 'query' | 'route' | 'header' | 'context';

export interface EndpointArgumentDescriptor<T = any> {
  readonly source: ArgumentSource;
  readonly schema?: any;
  readonly name?: string;
  readonly token?: any;
  resolveAsync(ctx: HttpContext): Promise<T> | T;
}

export type InferDescriptor<T> =
  T extends EndpointArgumentDescriptor<infer R> ? R : never;

export type InferDescriptors<T extends readonly EndpointArgumentDescriptor[]> = {
  [K in keyof T]: InferDescriptor<T[K]>;
};
