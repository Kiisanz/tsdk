import { createToken } from '@tsnx/hosting';
import type { HttpContext } from '../http/http-context.js';
import type { ProblemDetails } from './types.js';

export interface ProblemDetailsOptions {
  customize?: (ctx: HttpContext, problem: ProblemDetails) => void;
}

export const PROBLEM_DETAILS_OPTIONS = createToken<ProblemDetailsOptions>('ProblemDetailsOptions');
