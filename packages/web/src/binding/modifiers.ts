import {
  ARRAY_SYMBOL,
  ArrayDescriptor,
  NULLABLE_SYMBOL,
  NullableDescriptor,
  OPTIONAL_SYMBOL,
  OptionalDescriptor,
  SchemaField,
} from './types.js';

export function optional<T extends SchemaField>(type: T): OptionalDescriptor<T> {
  return {
    [OPTIONAL_SYMBOL]: true,
    inner: type,
  };
}

export function nullable<T extends SchemaField>(type: T): NullableDescriptor<T> {
  return {
    [NULLABLE_SYMBOL]: true,
    inner: type,
  };
}

export function array<T extends SchemaField>(type: T): ArrayDescriptor<T> {
  return {
    [ARRAY_SYMBOL]: true,
    inner: type,
  };
}

export function isOptional(field: any): field is OptionalDescriptor {
  return Boolean(field && typeof field === 'object' && field[OPTIONAL_SYMBOL] === true);
}

export function isNullable(field: any): field is NullableDescriptor {
  return Boolean(field && typeof field === 'object' && field[NULLABLE_SYMBOL] === true);
}

export function isArrayDescriptor(field: any): field is ArrayDescriptor {
  return Boolean(field && typeof field === 'object' && field[ARRAY_SYMBOL] === true);
}

export interface FieldMetadata {
  isOptional: boolean;
  isNullable: boolean;
  isArray: boolean;
  innerType: any;
}

export function inspectField(field: SchemaField): FieldMetadata {
  let current: any = field;
  let opt = false;
  let nullb = false;
  let arr = false;

  while (current && typeof current === 'object' && (isOptional(current) || isNullable(current) || isArrayDescriptor(current))) {
    if (isOptional(current)) {
      opt = true;
      current = current.inner;
    } else if (isNullable(current)) {
      nullb = true;
      current = current.inner;
    } else if (isArrayDescriptor(current)) {
      arr = true;
      current = current.inner;
    }
  }

  return {
    isOptional: opt,
    isNullable: nullb,
    isArray: arr,
    innerType: current,
  };
}
