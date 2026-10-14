export interface ScalarOptions {
  /**
   * The route where the Scalar API reference UI will be served.
   * @default '/scalar/v1'
   */
  readonly endpoint?: string;
  /**
   * The URL or route of the OpenAPI specification JSON document.
   * @default '/openapi/v1.json'
   */
  readonly openApiRoute?: string;
  /**
   * Page title displayed in the browser tab.
   * @default 'TSNX API Reference'
   */
  readonly title?: string;
  /**
   * Scalar theme name: 'default', 'alternate', 'moon', 'purple', 'solarized', 'bluePlanet', 'saturn', 'kepler', 'mars', 'deepSpace'.
   * @default 'default'
   */
  readonly theme?: string;
  /**
   * Custom CSS styling to inject into the page header.
   */
  readonly customCss?: string;
  /**
   * Scalar CDN bundle URL.
   * @default 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
   */
  readonly cdnUrl?: string;
  /**
   * Additional configuration object passed to Scalar.
   */
  readonly configuration?: Record<string, any>;
}
