import { BindingErrorEntry, RequestBindingException } from './binding-error.js';
import { inspectField } from './modifiers.js';
import { parseIso8601Date, parseStringBoolean, parseStringNumber } from './parsers.js';
import { BindingSchema, Infer } from './types.js';

export function bindRoute<T extends BindingSchema>(
  schema: T,
  routeParams: Record<string, string | undefined>,
): Infer<T> {
  const errors: BindingErrorEntry[] = [];
  const result: Record<string, any> = {};

  for (const [key, field] of Object.entries(schema)) {
    const meta = inspectField(field);

    if (meta.isArray) {
      errors.push({
        source: 'route',
        path: key,
        message: `Array binding is not supported for route parameters`,
      });
      continue;
    }

    const rawValue = routeParams[key];
    const exists = rawValue !== undefined && rawValue !== '';

    if (!exists) {
      if (!meta.isOptional) {
        errors.push({
          source: 'route',
          path: key,
          message: `Route parameter '${key}' is required`,
        });
      }
      continue;
    }

    if (rawValue === 'null' && meta.isNullable) {
      result[key] = null;
      continue;
    }

    const parsed = parseRouteScalar(meta.innerType, rawValue, key);
    if (parsed.success) {
      result[key] = parsed.value;
    } else {
      errors.push({
        source: 'route',
        path: key,
        message: parsed.error,
      });
    }
  }

  if (errors.length > 0) {
    throw new RequestBindingException(errors);
  }

  return result as Infer<T>;
}

function parseRouteScalar(
  type: any,
  value: string,
  path: string,
): { success: true; value: any } | { success: false; error: string } {
  if (type === String) {
    return { success: true, value };
  }

  if (type === Number) {
    const num = parseStringNumber(value);
    if (!num.success) {
      return { success: false, error: `Must be a valid number, received '${value}'` };
    }
    return { success: true, value: num.value };
  }

  if (type === Boolean) {
    const bool = parseStringBoolean(value);
    if (!bool.success) {
      return { success: false, error: `Must be a boolean ('true' or 'false'), received '${value}'` };
    }
    return { success: true, value: bool.value };
  }

  if (type === Date) {
    const parsedDate = parseIso8601Date(value);
    if (!parsedDate.success) {
      return { success: false, error: parsedDate.error };
    }
    return { success: true, value: parsedDate.value };
  }

  return { success: false, error: `Unsupported schema type for route parameter '${path}'` };
}
