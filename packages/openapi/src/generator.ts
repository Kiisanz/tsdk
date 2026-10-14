import { WebApplication } from '@tsnx/web';
import {
  OpenApiDocument,
  OpenApiInfo,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiOptions,
  OpenApiResponse,
} from './types.js';
import {
  PROBLEM_DETAILS_SCHEMA,
  convertSchemaFieldToJsonSchema,
  convertToJsonSchema,
} from './schema-converter.js';
import { isOptional } from '@tsnx/web';

const STATUS_CODE_DESCRIPTIONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Transforms an Express/TSNX pattern with :param segments to an OpenAPI {param} pattern.
 * e.g. /users/:userId/posts/:postId -> /users/{userId}/posts/{postId}
 */
export function convertPathPattern(pattern: string): string {
  return pattern.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
}

/**
 * Generates an OpenAPI 3.1 Document from the registered endpoints of a WebApplication.
 */
export function generateOpenApiDocument(
  app: WebApplication,
  options: OpenApiOptions = {},
): OpenApiDocument {
  const info: OpenApiInfo = {
    title: options.info?.title ?? options.title ?? 'TSNX API',
    version: options.info?.version ?? options.version ?? '1.0.0',
    description: options.info?.description ?? options.description,
    termsOfService: options.info?.termsOfService,
    contact: options.info?.contact,
    license: options.info?.license,
  };

  const servers = options.servers ?? [{ url: '/' }];
  const paths: Record<string, Record<string, OpenApiOperation>> = {};
  const tagsSet = new Set<string>();

  for (const endpoint of app.endpoints) {
    // Skip self-documentation endpoints if registered
    if (
      endpoint.pattern === '/openapi/v1.json' ||
      endpoint.pattern.startsWith('/scalar') ||
      endpoint.pattern.startsWith('/swagger')
    ) {
      continue;
    }

    const openApiPath = convertPathPattern(endpoint.pattern);
    const method = endpoint.method.toLowerCase();

    // Extract path param names in OpenAPI format {param}
    const pathParamMatches = Array.from(openApiPath.matchAll(/\{([a-zA-Z0-9_]+)\}/g)).map(
      (m) => m[1],
    );

    const parameters: OpenApiParameter[] = [];
    const documentedPathParams = new Set<string>();

    let requestBody: any = undefined;

    // Inspect argument descriptors
    for (const descriptor of endpoint.descriptors) {
      if (descriptor.source === 'route' && descriptor.schema) {
        for (const [key, field] of Object.entries(descriptor.schema)) {
          parameters.push({
            name: key,
            in: 'path',
            required: true,
            schema: convertSchemaFieldToJsonSchema(field),
          });
          documentedPathParams.add(key);
        }
      } else if (descriptor.source === 'query' && descriptor.schema) {
        for (const [key, field] of Object.entries(descriptor.schema)) {
          parameters.push({
            name: key,
            in: 'query',
            required: !isOptional(field),
            schema: convertSchemaFieldToJsonSchema(field),
          });
        }
      } else if (descriptor.source === 'header' && descriptor.name) {
        // Explicit constraint: header(name) descriptor without typed schema defaults to string schema
        parameters.push({
          name: descriptor.name,
          in: 'header',
          required: false,
          schema: { type: 'string' },
        });
      } else if (descriptor.source === 'body' && descriptor.schema) {
        requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: convertToJsonSchema(descriptor.schema),
            },
          },
        };
      }
    }

    // Ensure all URL path parameters present in the route pattern are documented
    for (const paramName of pathParamMatches) {
      if (!documentedPathParams.has(paramName)) {
        parameters.push({
          name: paramName,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        });
        documentedPathParams.add(paramName);
      }
    }

    // Build responses from produces metadata
    const producesList = endpoint.metadata.getProduces();
    const responses: Record<string, OpenApiResponse> = {};

    if (producesList.length === 0) {
      responses['200'] = { description: 'OK' };
    } else {
      for (const item of producesList) {
        const code = String(item.statusCode);
        const description =
          STATUS_CODE_DESCRIPTIONS[item.statusCode] || `Response for status ${code}`;

        if (!responses[code]) {
          responses[code] = {
            description,
            content: {},
          };
        }

        const resObj = responses[code];
        let contentMap = resObj.content as Record<string, any> | undefined;
        if (!contentMap) {
          contentMap = {};
          (resObj as any).content = contentMap;
        }

        if (item.kind === 'produces') {
          if (item.schema) {
            contentMap[item.contentType] = {
              schema: convertToJsonSchema(item.schema),
            };
          } else {
            contentMap[item.contentType] = {};
          }
        } else if (item.kind === 'produces_problem') {
          contentMap[item.contentType] = {
            schema: PROBLEM_DETAILS_SCHEMA,
          };
        }
      }
    }

    // Tags
    const tags = endpoint.metadata.getTags();
    for (const tag of tags) {
      tagsSet.add(tag);
    }

    // Build operation
    const operation: OpenApiOperation = {
      summary: endpoint.metadata.getSummary(),
      description: endpoint.metadata.getDescription(),
      operationId: endpoint.builder?.getName(),
      tags: tags.length > 0 ? tags : undefined,
      parameters: parameters.length > 0 ? parameters : undefined,
      requestBody,
      responses,
    };

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }
    paths[openApiPath][method] = operation;
  }

  const documentTags =
    tagsSet.size > 0 ? Array.from(tagsSet).map((name) => ({ name })) : undefined;

  return {
    openapi: '3.1.0',
    info,
    servers,
    paths: paths as Record<string, OpenApiPathItem>,
    tags: documentTags,
  };
}
