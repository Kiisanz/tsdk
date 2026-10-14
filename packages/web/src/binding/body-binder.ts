import { BindingErrorEntry, RequestBindingException } from './binding-error.js';
import { isArrayDescriptor, isNullable, isOptional } from './modifiers.js';
import { parseIso8601Date } from './parsers.js';
import { BindingSchema, Infer, SchemaField } from './types.js';

export function bindBody<T extends BindingSchema>(
  schema: T,
  rawJson: unknown,
): Infer<T> {
  const errors: BindingErrorEntry[] = [];

  if (rawJson === null || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
    throw new RequestBindingException([
      {
        source: 'body',
        path: '$',
        message: 'Request body must be a valid JSON object',
      },
    ]);
  }

  const result: Record<string, any> = {};
  const record = rawJson as Record<string, any>;

  for (const [key, field] of Object.entries(schema)) {
    // Prototype pollution prevention: forbid special prototype keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const hasProp = Object.prototype.hasOwnProperty.call(record, key);
    const value = hasProp ? record[key] : undefined;

    const res = bindFieldRecursive(field, value, key, errors);
    if (res.success && !res.omitted) {
      result[key] = res.value;
    }
  }

  if (errors.length > 0) {
    throw new RequestBindingException(errors);
  }

  return result as Infer<T>;
}

function bindFieldRecursive(
  field: SchemaField,
  value: unknown,
  path: string,
  errors: BindingErrorEntry[],
): { success: boolean; value: any; omitted?: boolean } {
  // 1. Optional modifier
  if (isOptional(field)) {
    if (value === undefined) {
      return { success: true, value: undefined, omitted: true };
    }
    return bindFieldRecursive(field.inner, value, path, errors);
  }

  // 2. Nullable modifier
  if (isNullable(field)) {
    if (value === null) {
      return { success: true, value: null };
    }
    return bindFieldRecursive(field.inner, value, path, errors);
  }

  // Missing/undefined on required field
  if (value === undefined) {
    errors.push({
      source: 'body',
      path,
      message: `Field '${path}' is required`,
    });
    return { success: false, value: undefined };
  }

  // Null on non-nullable field
  if (value === null) {
    errors.push({
      source: 'body',
      path,
      message: `Field '${path}' cannot be null`,
    });
    return { success: false, value: undefined };
  }

  // 3. Array modifier
  if (isArrayDescriptor(field)) {
    if (!Array.isArray(value)) {
      errors.push({
        source: 'body',
        path,
        message: `Field '${path}' must be an array, received ${typeof value}`,
      });
      return { success: false, value: undefined };
    }

    const arrResult: any[] = [];
    let arrayHasError = false;

    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const itemPath = `${path}[${i}]`;
      const res = bindFieldRecursive(field.inner, item, itemPath, errors);
      if (res.success) {
        arrResult.push(res.value);
      } else {
        arrayHasError = true;
      }
    }

    return arrayHasError ? { success: false, value: undefined } : { success: true, value: arrResult };
  }

  // 4. Scalar or Nested Object handling
  const bindRes = bindJsonScalarOrNested(field, value, path);
  if (bindRes.success) {
    return { success: true, value: bindRes.value };
  } else {
    errors.push({
      source: 'body',
      path,
      message: bindRes.error,
    });
    return { success: false, value: undefined };
  }
}

function bindJsonScalarOrNested(
  type: any,
  value: unknown,
  path: string,
): { success: true; value: any } | { success: false; error: string } {
  // Primitives: Strict checking (no sloppy coercion)
  if (type === String) {
    if (typeof value !== 'string') {
      return { success: false, error: `Must be a string, received ${typeof value}` };
    }
    return { success: true, value };
  }

  if (type === Number) {
    if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
      return { success: false, error: `Must be a number, received ${typeof value}` };
    }
    return { success: true, value };
  }

  if (type === Boolean) {
    if (typeof value !== 'boolean') {
      return { success: false, error: `Must be a boolean, received ${typeof value}` };
    }
    return { success: true, value };
  }

  if (type === Date) {
    const parsed = parseIso8601Date(value);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }
    return { success: true, value: parsed.value };
  }

  // Nested Schema
  if (type && typeof type === 'object') {
    try {
      const nested = bindBody(type, value);
      return { success: true, value: nested };
    } catch (err: unknown) {
      if (err instanceof RequestBindingException) {
        return {
          success: false,
          error: err.entries.map((e) => `[${e.path}] ${e.message}`).join(', '),
        };
      }
      return { success: false, error: 'Invalid nested object' };
    }
  }

  return { success: false, error: `Unsupported schema type for path '${path}'` };
}
