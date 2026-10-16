import { createToken, ServiceCollection } from '@tsnx/hosting';
import type { HttpContext } from '../http/http-context.js';
import {
  ConcurrencyLimiter,
  FixedWindowLimiter,
  IRateLimiter,
  SlidingWindowLimiter,
  TokenBucketLimiter,
} from './limiters.js';
import {
  ConcurrencyLimiterOptions,
  FixedWindowRateLimiterOptions,
  PartitionedPolicyCallback,
  SlidingWindowRateLimiterOptions,
  TokenBucketRateLimiterOptions,
} from './types.js';

export const DEFAULT_RATE_LIMIT_POLICY = '__DefaultRateLimitPolicy';

export interface RegisteredPolicy {
  limiter?: IRateLimiter;
  partitionKey?: (ctx: HttpContext) => string;
  customPartitionCallback?: PartitionedPolicyCallback;
}

export class RateLimiterOptions {
  public rejectionStatusCode = 429;
  public onRejected?: (ctx: HttpContext, retryAfterSeconds?: number) => Promise<void> | void;
  private readonly policies = new Map<string, RegisteredPolicy>();

  public addFixedWindowLimiter(
    policyName: string,
    configureOrOptions: FixedWindowRateLimiterOptions | ((opt: FixedWindowRateLimiterOptions) => void)
  ): this {
    let options: FixedWindowRateLimiterOptions;
    if (typeof configureOrOptions === 'function') {
      options = { permitLimit: 100, windowSeconds: 60 };
      configureOrOptions(options);
    } else {
      options = configureOrOptions;
    }
    const limiter = new FixedWindowLimiter(options);
    this.policies.set(policyName, { limiter, partitionKey: options.partitionKey });
    return this;
  }

  public addSlidingWindowLimiter(
    policyName: string,
    configureOrOptions: SlidingWindowRateLimiterOptions | ((opt: SlidingWindowRateLimiterOptions) => void)
  ): this {
    let options: SlidingWindowRateLimiterOptions;
    if (typeof configureOrOptions === 'function') {
      options = { permitLimit: 100, windowSeconds: 60 };
      configureOrOptions(options);
    } else {
      options = configureOrOptions;
    }
    const limiter = new SlidingWindowLimiter(options);
    this.policies.set(policyName, { limiter, partitionKey: options.partitionKey });
    return this;
  }

  public addTokenBucketLimiter(
    policyName: string,
    configureOrOptions: TokenBucketRateLimiterOptions | ((opt: TokenBucketRateLimiterOptions) => void)
  ): this {
    let options: TokenBucketRateLimiterOptions;
    if (typeof configureOrOptions === 'function') {
      options = { tokenLimit: 100, replenishmentPeriodSeconds: 10, tokensPerPeriod: 10 };
      configureOrOptions(options);
    } else {
      options = configureOrOptions;
    }
    const limiter = new TokenBucketLimiter(options);
    this.policies.set(policyName, { limiter, partitionKey: options.partitionKey });
    return this;
  }

  public addConcurrencyLimiter(
    policyName: string,
    configureOrOptions: ConcurrencyLimiterOptions | ((opt: ConcurrencyLimiterOptions) => void)
  ): this {
    let options: ConcurrencyLimiterOptions;
    if (typeof configureOrOptions === 'function') {
      options = { permitLimit: 10 };
      configureOrOptions(options);
    } else {
      options = configureOrOptions;
    }
    const limiter = new ConcurrencyLimiter(options);
    this.policies.set(policyName, { limiter, partitionKey: options.partitionKey });
    return this;
  }

  public addPolicy(policyName: string, callback: PartitionedPolicyCallback): this {
    this.policies.set(policyName, { customPartitionCallback: callback });
    return this;
  }

  public getPolicy(policyName?: string): RegisteredPolicy | undefined {
    return this.policies.get(policyName ?? DEFAULT_RATE_LIMIT_POLICY);
  }
}

export const RATE_LIMITER_OPTIONS = createToken<RateLimiterOptions>('RateLimiterOptions');

declare module '@tsnx/hosting' {
  interface ServiceCollection {
    addRateLimiter(configure?: (options: RateLimiterOptions) => void): this;
  }
}

if (!(ServiceCollection.prototype as any).addRateLimiter) {
  (ServiceCollection.prototype as any).addRateLimiter = function (
    this: ServiceCollection,
    configure?: (options: RateLimiterOptions) => void
  ): ServiceCollection {
    const options = new RateLimiterOptions();
    if (configure) {
      configure(options);
    }
    this.addSingleton(RATE_LIMITER_OPTIONS, options);
    return this;
  };
}
