export const OPTIONAL_SYMBOL: unique symbol = Symbol('tsnx.binding.optional');
export const NULLABLE_SYMBOL: unique symbol = Symbol('tsnx.binding.nullable');
export const ARRAY_SYMBOL: unique symbol = Symbol('tsnx.binding.array');

export type PrimitiveConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | DateConstructor;

export interface OptionalDescriptor<T = any> {
  readonly [OPTIONAL_SYMBOL]: true;
  readonly inner: T;
}

export interface NullableDescriptor<T = any> {
  readonly [NULLABLE_SYMBOL]: true;
  readonly inner: T;
}

export interface ArrayDescriptor<T = any> {
  readonly [ARRAY_SYMBOL]: true;
  readonly inner: T;
}

export type SchemaField =
  | PrimitiveConstructor
  | OptionalDescriptor
  | NullableDescriptor
  | ArrayDescriptor
  | BindingSchema;

export interface BindingSchema {
  [key: string]: SchemaField;
}

// Type inference helper types
type ResolveBase<T> =
  T extends StringConstructor ? string
  : T extends NumberConstructor ? number
  : T extends BooleanConstructor ? boolean
  : T extends DateConstructor ? Date
  : T extends ArrayDescriptor<infer U> ? ResolveBase<U>[]
  : T extends BindingSchema ? Infer<T>
  : never;

type ResolveNullable<T> =
  T extends NullableDescriptor<infer U> ? ResolveBase<U> | null
  : T extends OptionalDescriptor<infer U>
    ? U extends NullableDescriptor<infer V>
      ? ResolveBase<V> | null
      : ResolveBase<U>
  : ResolveBase<T>;

type IsOptional<T> =
  T extends OptionalDescriptor<any> ? true
  : T extends NullableDescriptor<infer U>
    ? U extends OptionalDescriptor<any>
      ? true
      : false
  : false;

export type Infer<T extends BindingSchema> = {
  [K in keyof T as IsOptional<T[K]> extends false ? K : never]: ResolveNullable<T[K]>;
} & {
  [K in keyof T as IsOptional<T[K]> extends true ? K : never]?: ResolveNullable<T[K]>;
};
