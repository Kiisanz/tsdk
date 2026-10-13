import { ScalarOptions } from './types.js';

/**
 * Generates the standalone HTML page embedding the Scalar API Reference UI.
 */
export function renderScalarPage(options: ScalarOptions = {}): string {
  const title = options.title ?? 'TSNX API Reference';
  const openApiRoute = options.openApiRoute ?? '/openapi/v1.json';
  const theme = options.theme ?? 'default';
  const cdnUrl = options.cdnUrl ?? 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
  const customCss = options.customCss ?? '';

  const scalarConfiguration = {
    theme,
    ...(options.configuration ?? {}),
  };

  const configJson = JSON.stringify(scalarConfiguration).replace(/'/g, '&#39;');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
      }
      ${customCss}
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${openApiRoute}"
      data-configuration='${configJson}'
    ></script>
    <script src="${cdnUrl}"></script>
  </body>
</html>`;
}
