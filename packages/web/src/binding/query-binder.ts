import { BindingErrorEntry, RequestBindingException } from './binding-error.js';
import { inspectField } from './modifiers.js';
import { parseIso8601Date, parseStringBoolean, parseStringNumber } from './parsers.js';
import { BindingSchema, Infer } from './types.js';

export function bindQuery<T extends BindingSchema>(
  schema: T,
  querySource: URLSearchParams | Record<string, string | string[] | undefined>,
): Infer<T> {
  const errors: BindingErrorEntry[] = [];
  const result: Record<string, any> = {};

  const isSearchParams = querySource instanceof URLSearchParams;

  for (const [key, field] of Object.entries(schema)) {
    const meta = inspectField(field);

    if (meta.isArray) {
      // Array field: handle multiple values (e.g. ?tag=a&tag=b)
      let rawValues: string[] = [];
      let exists = false;

      if (isSearchParams) {
        if (querySource.has(key)) {
          rawValues = querySource.getAll(key);
          exists = true;
        }
      } else {
        const val = querySource[key];
        if (val !== undefined) {
          exists = true;
          rawValues = Array.isArray(val) ? val : [val];
        }
      }

      if (!exists || rawValues.length === 0) {
        if (!meta.isOptional) {
          errors.push({
            source: 'query',
            path: key,
            message: `Query parameter '${key}' is required`,
          });
        }
        continue;
      }

      const arrResult: any[] = [];
      let arrayHasError = false;

      for (let i = 0; i < rawValues.length; i++) {
        const item = rawValues[i];
        const itemPath = `${key}[${i}]`;

        const parsed = parseQueryScalar(meta.innerType, item, itemPath);
        if (parsed.success) {
          arrResult.push(parsed.value);
        } else {
          errors.push({
            source: 'query',
            path: itemPath,
            message: parsed.error,
          });
          arrayHasError = true;
        }
      }

      if (!arrayHasError) {
        result[key] = arrResult;
      }
      continue;
    }

    // Scalar field
    let rawValue: string | undefined;
    let exists = false;

    if (isSearchParams) {
      if (querySource.has(key)) {
        const allVals = querySource.getAll(key);
        if (allVals.length > 1) {
          errors.push({
            source: 'query',
            path: key,
            message: `Query parameter '${key}' cannot have multiple values`,
          });
          continue;
        }
        exists = true;
        rawValue = allVals[0];
      }
    } else {
      const val = querySource[key];
      if (val !== undefined) {
        if (Array.isArray(val) && val.length > 1) {
          errors.push({
            source: 'query',
            path: key,
            message: `Query parameter '${key}' cannot have multiple values`,
          });
          continue;
        }
        exists = true;
        rawValue = Array.isArray(val) ? val[0] : val;
      }
    }

    if (!exists || rawValue === undefined) {
      if (!meta.isOptional) {
        errors.push({
          source: 'query',
          path: key,
          message: `Query parameter '${key}' is required`,
        });
      }
      continue;
    }

    // Null check: query string ?key=null
    if (rawValue === 'null') {
      if (meta.isNullable) {
        result[key] = null;
        continue;
      }
    }

    const parsed = parseQueryScalar(meta.innerType, rawValue, key);
    if (parsed.success) {
      result[key] = parsed.value;
    } else {
      errors.push({
        source: 'query',
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

function parseQueryScalar(
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

  return { success: false, error: `Unsupported schema type for query parameter '${path}'` };
}
