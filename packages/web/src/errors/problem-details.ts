import { STATUS_CODES } from 'node:http';
import { ProblemDetails, ProblemDetailsInput } from './types.js';

/**
 * Formats a problem details object strictly according to RFC 9457.
 * Standard members: type, title, status, detail, instance.
 * Extension members: serialized as top-level properties.
 */
export function formatProblemDetails(input: ProblemDetailsInput, defaultStatus = 500): ProblemDetails {
  const status = typeof input.status === 'number' ? input.status : defaultStatus;
  const title = input.title ?? STATUS_CODES[status] ?? 'An error occurred';
  const type = input.type ?? 'about:blank';

  const problem: ProblemDetails = {
    type,
    title,
    status,
  };

  if (input.detail !== undefined) {
    problem.detail = input.detail;
  }

  if (input.instance !== undefined) {
    problem.instance = input.instance;
  }

  // RFC 9457: Extension members are top-level properties
  // 1. Copy from extensions object if provided
  if (input.extensions && typeof input.extensions === 'object') {
    for (const [key, value] of Object.entries(input.extensions)) {
      if (
        key !== 'type' &&
        key !== 'title' &&
        key !== 'status' &&
        key !== 'detail' &&
        key !== 'instance'
      ) {
        problem[key] = value;
      }
    }
  }

  // 2. Copy any extra top-level properties from input (e.g. { errors: { ... } })
  for (const [key, value] of Object.entries(input)) {
    if (
      key !== 'type' &&
      key !== 'title' &&
      key !== 'status' &&
      key !== 'detail' &&
      key !== 'instance' &&
      key !== 'extensions'
    ) {
      problem[key] = value;
    }
  }

  return problem;
}
