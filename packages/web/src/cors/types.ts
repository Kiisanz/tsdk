export interface CorsPolicy {
  name?: string;
  origins?: string[];
  isOriginAllowed?: (origin: string) => boolean;
  allowAnyOrigin?: boolean;
  methods?: string[];
  allowAnyMethod?: boolean;
  headers?: string[];
  allowAnyHeader?: boolean;
  allowCredentials?: boolean;
  exposedHeaders?: string[];
  preflightMaxAgeSeconds?: number;
}

export const ENABLE_CORS_KEY = 'tsnx.cors.enable';
export const DISABLE_CORS_KEY = 'tsnx.cors.disable';

export interface EnableCorsMetadata {
  policyName?: string;
}

export interface DisableCorsMetadata {
  disabled: true;
}
