import type { HttpContext } from '../http/http-context.js';

export interface RateLimitLease {
  readonly isAcquired: boolean;
  readonly retryAfterSeconds?: number;
  dispose(): void;
}

export interface FixedWindowRateLimiterOptions {
  permitLimit: number;
  windowSeconds: number;
  partitionKey?: (ctx: HttpContext) => string;
}

export interface SlidingWindowRateLimiterOptions {
  permitLimit: number;
  windowSeconds: number;
  segmentsPerWindow?: number;
  partitionKey?: (ctx: HttpContext) => string;
}

export interface TokenBucketRateLimiterOptions {
  tokenLimit: number;
  replenishmentPeriodSeconds: number;
  tokensPerPeriod: number;
  partitionKey?: (ctx: HttpContext) => string;
}

export interface ConcurrencyLimiterOptions {
  permitLimit: number;
  partitionKey?: (ctx: HttpContext) => string;
}

export interface PartitionedPolicyResult {
  partitionKey: string;
  permitLimit: number;
  windowSeconds: number;
}

export type PartitionedPolicyCallback = (ctx: HttpContext) => PartitionedPolicyResult;

export const ENABLE_RATE_LIMITING_KEY = 'tsnx.rate_limiting.enable';
export const DISABLE_RATE_LIMITING_KEY = 'tsnx.rate_limiting.disable';

export interface EnableRateLimitingMetadata {
  policyName?: string;
}

export interface DisableRateLimitingMetadata {
  disabled: true;
}
