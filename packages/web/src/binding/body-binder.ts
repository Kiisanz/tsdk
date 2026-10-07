import { BindingErrorEntry, RequestBindingException } from './binding-error.js';
import { inspectField } from './modifiers.js';
import { parseIso8601Date } from './parsers.js';
import { BindingSchema, Infer } from './types.js';

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

    const meta = inspectField(field);
    const hasProp = Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
    const value = record[key];

    // 1. Missing / undefined handling
    if (!hasProp) {
      if (!meta.isOptional) {
        errors.push({
          source: 'body',
          path: key,
          message: `Field '${key}' is required`,
        });
      }
      continue;
    }

    // 2. Null handling
    if (value === null) {
      if (!meta.isNullable) {
        errors.push({
          source: 'body',
          path: key,
          message: `Field '${key}' cannot be null`,
        });
      } else {
        result[key] = null;
      }
      continue;
    }

    // 3. Array handling
    if (meta.isArray) {
      if (!Array.isArray(value)) {
        errors.push({
          source: 'body',
          path: key,
          message: `Field '${key}' must be an array, received ${typeof value}`,
        });
        continue;
      }

      const arrResult: any[] = [];
      let arrayHasError = false;

      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const itemPath = `${key}[${i}]`;

        const bindRes = bindJsonScalarOrNested(meta.innerType, item, itemPath);
        if (bindRes.success) {
          arrResult.push(bindRes.value);
        } else {
          errors.push({
            source: 'body',
            path: itemPath,
            message: bindRes.error,
          });
          arrayHasError = true;
        }
      }

      if (!arrayHasError) {
        result[key] = arrResult;
      }
      continue;
    }

    // 4. Scalar or Nested Object handling
    const bindRes = bindJsonScalarOrNested(meta.innerType, value, key);
    if (bindRes.success) {
      result[key] = bindRes.value;
    } else {
      errors.push({
        source: 'body',
        path: key,
        message: bindRes.error,
      });
    }
  }

  if (errors.length > 0) {
    throw new RequestBindingException(errors);
  }

  return result as Infer<T>;
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
