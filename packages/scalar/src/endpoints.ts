import { HttpContext, Results, RouteHandlerBuilder, WebApplication } from '@tsnx/web';
import { renderScalarPage } from './page.js';
import { ScalarOptions } from './types.js';

declare module '@tsnx/web' {
  interface WebApplication {
    mapScalarApiReference(
      endpointOrOptions?: string | ScalarOptions,
      maybeOptions?: ScalarOptions,
    ): RouteHandlerBuilder;
  }
}

/**
 * Maps the interactive Scalar API Reference UI endpoint to the web application.
 * Modeled after ASP.NET Core `app.MapScalarApiReference()`.
 *
 * Defaults to `/scalar/v1`.
 */
export function mapScalarApiReference(
  app: WebApplication,
  endpointOrOptions?: string | ScalarOptions,
  maybeOptions?: ScalarOptions,
): RouteHandlerBuilder {
  let endpoint = '/scalar/v1';
  let options: ScalarOptions = {};

  if (typeof endpointOrOptions === 'string') {
    endpoint = endpointOrOptions;
    options = maybeOptions ?? {};
  } else if (endpointOrOptions && typeof endpointOrOptions === 'object') {
    options = endpointOrOptions;
    endpoint = options.endpoint ?? '/scalar/v1';
  }

  const effectiveOptions: ScalarOptions = {
    ...options,
    endpoint,
  };

  const html = renderScalarPage(effectiveOptions);

  return app.mapGet(endpoint, (_ctx: HttpContext) => {
    return Results.html(html);
  });
}

// Attach method to WebApplication prototype for idiomatic method chaining
(WebApplication.prototype as any).mapScalarApiReference = function (
  this: WebApplication,
  endpointOrOptions?: string | ScalarOptions,
  maybeOptions?: ScalarOptions,
): RouteHandlerBuilder {
  return mapScalarApiReference(this, endpointOrOptions, maybeOptions);
};
