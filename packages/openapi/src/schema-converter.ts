import {
  BindingSchema,
  isArrayDescriptor,
  isNullable,
  isOptional,
} from '@tsnx/web';

/**
 * Standard RFC 9457 Problem Details JSON Schema for HTTP API errors.
 */
export const PROBLEM_DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' },
    errors: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
  required: ['type', 'title', 'status'],
} as const;

/**
 * Recursively converts a TSNX SchemaField (primitives, modifiers, nested objects) to OpenAPI 3.1 JSON Schema.
 */
export function convertSchemaFieldToJsonSchema(field: any): any {
  if (!field) {
    return {};
  }

  // Handle optional modifier by unwrapping inner
  if (isOptional(field)) {
    return convertSchemaFieldToJsonSchema(field.inner);
  }

  // Handle nullable modifier (OpenAPI 3.1 multi-type or anyOf with null)
  if (isNullable(field)) {
    const inner = convertSchemaFieldToJsonSchema(field.inner);
    if (typeof inner.type === 'string') {
      return { ...inner, type: [inner.type, 'null'] };
    }
    if (Array.isArray(inner.type)) {
      if (!inner.type.includes('null')) {
        return { ...inner, type: [...inner.type, 'null'] };
      }
      return inner;
    }
    return { anyOf: [inner, { type: 'null' }] };
  }

  // Handle array modifier
  if (isArrayDescriptor(field)) {
    return {
      type: 'array',
      items: convertSchemaFieldToJsonSchema(field.inner),
    };
  }

  // Handle primitive constructors
  if (field === String) {
    return { type: 'string' };
  }
  if (field === Number) {
    return { type: 'number' };
  }
  if (field === Boolean) {
    return { type: 'boolean' };
  }
  if (field === Date) {
    return { type: 'string', format: 'date-time' };
  }

  // Handle existing JSON schemas or nested BindingSchema
  if (typeof field === 'object' && field !== null) {
    // If it already is a JSON Schema definition
    if ('type' in field || '$ref' in field || 'anyOf' in field || 'oneOf' in field || 'allOf' in field) {
      return field;
    }
    return convertBindingSchemaToJsonSchema(field);
  }

  return { type: 'string' };
}

/**
 * Converts a TSNX BindingSchema object record to an OpenAPI 3.1 object JSON Schema.
 */
export function convertBindingSchemaToJsonSchema(schema: BindingSchema): any {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(schema)) {
    properties[key] = convertSchemaFieldToJsonSchema(field);
    if (!isOptional(field)) {
      required.push(key);
    }
  }

  const result: any = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

/**
 * Universal JSON schema converter supporting BindingSchema, arrays, primitives, and raw schema objects.
 */
export function convertToJsonSchema(input: any): any {
  if (!input) return {};
  if (isOptional(input) || isNullable(input) || isArrayDescriptor(input)) {
    return convertSchemaFieldToJsonSchema(input);
  }
  if (input === String || input === Number || input === Boolean || input === Date) {
    return convertSchemaFieldToJsonSchema(input);
  }
  if (typeof input === 'object' && input !== null) {
    if ('type' in input || '$ref' in input || 'anyOf' in input || 'oneOf' in input || 'allOf' in input) {
      return input;
    }
    return convertBindingSchemaToJsonSchema(input);
  }
  return { type: 'string' };
}
