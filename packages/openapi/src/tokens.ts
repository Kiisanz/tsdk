import { createToken, InjectionToken } from '@tsnx/hosting';
import { OpenApiOptions } from './types.js';

export const OPENAPI_OPTIONS: InjectionToken<OpenApiOptions> =
  createToken<OpenApiOptions>('OpenApiOptions');
