import type { HttpContext } from '../http/http-context.js';
import type { RequestDelegate } from '../middleware/pipeline.js';
import { FixedWindowLimiter } from './limiters.js';
import { RATE_LIMITER_OPTIONS, RateLimiterOptions } from './rate-limiter-options.js';
import {
  DISABLE_RATE_LIMITING_KEY,
  ENABLE_RATE_LIMITING_KEY,
  EnableRateLimitingMetadata,
  RateLimitLease,
} from './types.js';

// Cache for custom partitioned limiters
const customPartitionStore = new Map<string, FixedWindowLimiter>();

export function createRateLimiterMiddleware() {
  return async (ctx: HttpContext, next: RequestDelegate): Promise<void> => {
    let options: RateLimiterOptions | undefined;
    try {
      options = ctx.services.get(RATE_LIMITER_OPTIONS);
    } catch {
      // RateLimiterOptions not registered
    }

    if (!options) {
      await next(ctx);
      return;
    }

    // 1. Check endpoint metadata
    const endpointMetadata = ctx.items.get('__tsnx_endpoint_metadata');
    if (endpointMetadata && typeof endpointMetadata.getCustom === 'function') {
      if (endpointMetadata.getCustom(DISABLE_RATE_LIMITING_KEY)) {
        await next(ctx);
        return;
      }
    }

    let policyName: string | undefined;
    if (endpointMetadata && typeof endpointMetadata.getCustom === 'function') {
      const enableMetadata = endpointMetadata.getCustom(ENABLE_RATE_LIMITING_KEY) as EnableRateLimitingMetadata | undefined;
      if (enableMetadata?.policyName) {
        policyName = enableMetadata.policyName;
      }
    }

    // 2. Resolve policy
    const policy = options.getPolicy(policyName);
    if (!policy) {
      await next(ctx);
      return;
    }

    // 3. Evaluate lease
    let lease: RateLimitLease;

    if (policy.customPartitionCallback) {
      const result = policy.customPartitionCallback(ctx);
      const cacheKey = `${policyName || 'default'}::${result.permitLimit}_${result.windowSeconds}`;
      let limiter = customPartitionStore.get(cacheKey);
      if (!limiter) {
        limiter = new FixedWindowLimiter({
          permitLimit: result.permitLimit,
          windowSeconds: result.windowSeconds,
        });
        customPartitionStore.set(cacheKey, limiter);
      }
      lease = limiter.acquire(result.partitionKey);
    } else if (policy.limiter) {
      const key = policy.partitionKey ? policy.partitionKey(ctx) : ctx.request.clientIp || 'global';
      lease = policy.limiter.acquire(key);
    } else {
      await next(ctx);
      return;
    }

    // 4. Handle result
    if (lease.isAcquired) {
      ctx.response.onCompleted(() => {
        lease.dispose();
      });
      await next(ctx);
    } else {
      const statusCode = options.rejectionStatusCode || 429;
      ctx.response.statusCode = statusCode;

      if (lease.retryAfterSeconds !== undefined && lease.retryAfterSeconds > 0) {
        ctx.response.setHeader('Retry-After', String(lease.retryAfterSeconds));
      }

      if (options.onRejected) {
        await options.onRejected(ctx, lease.retryAfterSeconds);
      } else {
        await ctx.response.writeProblem({
          title: 'Too Many Requests',
          status: statusCode,
          detail: 'Quota exceeded. Please retry later.',
        });
      }
    }
  };
}
