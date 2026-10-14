import { HttpContext, Results, RouteHandlerBuilder, WebApplication } from '@tsnx/web';
import { renderScalarPage } from './page.js';
import { ScalarOptions } from './types.js';

declare module '@tsnx/web' {
  interface WebApplication {
    mapScalarApiReference(options?: ScalarOptions): RouteHandlerBuilder;
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
  options: ScalarOptions = {},
): RouteHandlerBuilder {
  const endpoint = options.endpoint ?? '/scalar/v1';
  const html = renderScalarPage(options);

  return app.mapGet(endpoint, (_ctx: HttpContext) => {
    return Results.html(html);
  });
}

// Attach method to WebApplication prototype for idiomatic method chaining
if (!(WebApplication.prototype as any).mapScalarApiReference) {
  (WebApplication.prototype as any).mapScalarApiReference = function (
    this: WebApplication,
    options?: ScalarOptions,
  ): RouteHandlerBuilder {
    return mapScalarApiReference(this, options);
  };
}
