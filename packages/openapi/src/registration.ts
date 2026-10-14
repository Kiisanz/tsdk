import { IServiceCollection } from '@tsnx/hosting';
import { OPENAPI_OPTIONS } from './tokens.js';
import { OpenApiOptions } from './types.js';

/**
 * Registers OpenAPI 3.1 document generation services into the DI container.
 * Modeled after ASP.NET Core `builder.Services.AddOpenApi()`.
 */
export function addOpenApi(
  services: IServiceCollection,
  options: OpenApiOptions = {},
): IServiceCollection {
  services.addSingleton(OPENAPI_OPTIONS, options);
  return services;
}
