import type { HttpContext } from '../http/http-context.js';
import type { RequestDelegate } from '../middleware/pipeline.js';
import { CORS_OPTIONS, CorsOptions } from './cors-options.js';
import { CorsPolicy, DISABLE_CORS_KEY, ENABLE_CORS_KEY, EnableCorsMetadata } from './types.js';

export function createCorsMiddleware(policyNameOrPolicy?: string | CorsPolicy) {
  return async (ctx: HttpContext, next: RequestDelegate): Promise<void> => {
    const rawOrigin = ctx.request.headers['origin'];
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

    // If request has no Origin header, CORS is not applicable
    if (!origin) {
      await next(ctx);
      return;
    }

    // 1. Resolve effective policy
    let options: CorsOptions | undefined;
    try {
      options = ctx.services.get(CORS_OPTIONS);
    } catch {
      // CorsOptions not registered in DI
    }

    // Check endpoint metadata if attached to items
    const endpointMetadata = ctx.items.get('__tsnx_endpoint_metadata');
    if (endpointMetadata && typeof endpointMetadata.getCustom === 'function') {
      if (endpointMetadata.getCustom(DISABLE_CORS_KEY)) {
        await next(ctx);
        return;
      }
      const enableMetadata = endpointMetadata.getCustom(ENABLE_CORS_KEY) as EnableCorsMetadata | undefined;
      if (enableMetadata?.policyName && options) {
        policyNameOrPolicy = enableMetadata.policyName;
      }
    }

    let policy: CorsPolicy | undefined;
    if (typeof policyNameOrPolicy === 'object' && policyNameOrPolicy !== null) {
      policy = policyNameOrPolicy;
    } else if (options) {
      policy = options.getPolicy(typeof policyNameOrPolicy === 'string' ? policyNameOrPolicy : undefined);
    }

    // If no policy is configured or found, proceed without CORS headers
    if (!policy) {
      await next(ctx);
      return;
    }

    // 2. Check if Origin is allowed
    const isAllowed = checkOrigin(origin, policy);
    if (!isAllowed) {
      // Origin is not allowed
      const isPreflight = ctx.request.method === 'OPTIONS' && ctx.request.headers['access-control-request-method'];
      if (isPreflight) {
        ctx.response.statusCode = 204;
        await ctx.response.end(204);
        return;
      }
      await next(ctx);
      return;
    }

    // 3. Preflight request handling
    const isPreflight = ctx.request.method === 'OPTIONS' && ctx.request.headers['access-control-request-method'];
    if (isPreflight) {
      const requestedMethod = String(ctx.request.headers['access-control-request-method'] ?? '').toUpperCase();
      const requestedHeaders = ctx.request.headers['access-control-request-headers'];

      // Apply Allow-Origin and Credentials
      applyAllowOrigin(ctx, origin, policy);

      // Apply Allow-Methods
      if (policy.allowAnyMethod) {
        ctx.response.setHeader('Access-Control-Allow-Methods', requestedMethod || 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      } else if (policy.methods && policy.methods.length > 0) {
        ctx.response.setHeader('Access-Control-Allow-Methods', policy.methods.join(', '));
      } else {
        ctx.response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      }

      // Apply Allow-Headers
      if (policy.allowAnyHeader) {
        if (requestedHeaders) {
          ctx.response.setHeader('Access-Control-Allow-Headers', Array.isArray(requestedHeaders) ? requestedHeaders.join(', ') : requestedHeaders);
        } else {
          ctx.response.setHeader('Access-Control-Allow-Headers', '*');
        }
      } else if (policy.headers && policy.headers.length > 0) {
        ctx.response.setHeader('Access-Control-Allow-Headers', policy.headers.join(', '));
      }

      // Apply Max-Age
      if (policy.preflightMaxAgeSeconds !== undefined && policy.preflightMaxAgeSeconds > 0) {
        ctx.response.setHeader('Access-Control-Max-Age', String(policy.preflightMaxAgeSeconds));
      }

      // Short-circuit preflight immediately with 204 No Content
      ctx.response.statusCode = 204;
      await ctx.response.end(204);
      return;
    }

    // 4. Actual request handling: apply response headers before body starts
    ctx.response.onStarting(() => {
      applyAllowOrigin(ctx, origin, policy!);

      if (policy!.exposedHeaders && policy!.exposedHeaders.length > 0) {
        ctx.response.setHeader('Access-Control-Expose-Headers', policy!.exposedHeaders.join(', '));
      }
    });

    await next(ctx);
  };
}

function checkOrigin(origin: string, policy: CorsPolicy): boolean {
  if (policy.allowAnyOrigin) {
    return true;
  }
  if (policy.origins && policy.origins.includes(origin)) {
    return true;
  }
  if (policy.isOriginAllowed && policy.isOriginAllowed(origin)) {
    return true;
  }
  return false;
}

function applyAllowOrigin(ctx: HttpContext, origin: string, policy: CorsPolicy): void {
  if (policy.allowCredentials) {
    // When credentials are allowed, wildcard '*' is illegal per W3C CORS spec.
    // Must reflect the specific request origin and set Vary: Origin
    ctx.response.setHeader('Access-Control-Allow-Origin', origin);
    ctx.response.setHeader('Access-Control-Allow-Credentials', 'true');
    ctx.response.setHeader('Vary', 'Origin');
  } else if (policy.allowAnyOrigin) {
    ctx.response.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    ctx.response.setHeader('Access-Control-Allow-Origin', origin);
    ctx.response.setHeader('Vary', 'Origin');
  }
}
