import {
  ConcurrencyLimiterOptions,
  FixedWindowRateLimiterOptions,
  RateLimitLease,
  SlidingWindowRateLimiterOptions,
  TokenBucketRateLimiterOptions,
} from './types.js';

export interface IRateLimiter {
  acquire(key: string): RateLimitLease;
}

export class FixedWindowLimiter implements IRateLimiter {
  private readonly store = new Map<string, { windowStart: number; count: number }>();

  constructor(public readonly options: FixedWindowRateLimiterOptions) {}

  public acquire(key: string): RateLimitLease {
    const now = Date.now();
    const windowMs = this.options.windowSeconds * 1000;
    const currentWindowStart = Math.floor(now / windowMs) * windowMs;

    let entry = this.store.get(key);
    if (!entry || entry.windowStart !== currentWindowStart) {
      entry = { windowStart: currentWindowStart, count: 0 };
      this.store.set(key, entry);
    }

    if (entry.count < this.options.permitLimit) {
      entry.count++;
      return {
        isAcquired: true,
        dispose: () => {},
      };
    }

    const resetInSeconds = Math.max(1, Math.ceil((currentWindowStart + windowMs - now) / 1000));
    return {
      isAcquired: false,
      retryAfterSeconds: resetInSeconds,
      dispose: () => {},
    };
  }
}

export class SlidingWindowLimiter implements IRateLimiter {
  private readonly store = new Map<string, { segments: { start: number; count: number }[] }>();

  constructor(public readonly options: SlidingWindowRateLimiterOptions) {}

  public acquire(key: string): RateLimitLease {
    const now = Date.now();
    const segmentsCount = this.options.segmentsPerWindow ?? 4;
    const windowMs = this.options.windowSeconds * 1000;
    const segmentMs = windowMs / segmentsCount;
    const currentSegmentStart = Math.floor(now / segmentMs) * segmentMs;
    const cutoff = now - windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { segments: [] };
      this.store.set(key, entry);
    }

    // Purge expired segments
    entry.segments = entry.segments.filter((s) => s.start >= cutoff);

    // Sum active counts across segments
    const totalCount = entry.segments.reduce((sum, s) => sum + s.count, 0);

    if (totalCount < this.options.permitLimit) {
      let curSegment = entry.segments.find((s) => s.start === currentSegmentStart);
      if (!curSegment) {
        curSegment = { start: currentSegmentStart, count: 0 };
        entry.segments.push(curSegment);
      }
      curSegment.count++;
      return {
        isAcquired: true,
        dispose: () => {},
      };
    }

    // Earliest segment expiry determines retryAfter
    const earliest = entry.segments[0];
    const retryAfter = earliest
      ? Math.max(1, Math.ceil((earliest.start + windowMs - now) / 1000))
      : Math.max(1, this.options.windowSeconds);

    return {
      isAcquired: false,
      retryAfterSeconds: retryAfter,
      dispose: () => {},
    };
  }
}

export class TokenBucketLimiter implements IRateLimiter {
  private readonly store = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(public readonly options: TokenBucketRateLimiterOptions) {}

  public acquire(key: string): RateLimitLease {
    const now = Date.now();
    const refillMs = this.options.replenishmentPeriodSeconds * 1000;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { tokens: this.options.tokenLimit, lastRefill: now };
      this.store.set(key, entry);
    } else {
      // Replenish tokens
      const elapsed = now - entry.lastRefill;
      if (elapsed >= refillMs) {
        const periods = Math.floor(elapsed / refillMs);
        entry.tokens = Math.min(this.options.tokenLimit, entry.tokens + periods * this.options.tokensPerPeriod);
        entry.lastRefill = entry.lastRefill + periods * refillMs;
      }
    }

    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      return {
        isAcquired: true,
        dispose: () => {},
      };
    }

    const nextRefillInMs = Math.max(100, refillMs - (now - entry.lastRefill));
    const retryAfterSeconds = Math.max(1, Math.ceil(nextRefillInMs / 1000));

    return {
      isAcquired: false,
      retryAfterSeconds,
      dispose: () => {},
    };
  }
}

export class ConcurrencyLimiter implements IRateLimiter {
  private readonly store = new Map<string, { active: number }>();

  constructor(public readonly options: ConcurrencyLimiterOptions) {}

  public acquire(key: string): RateLimitLease {
    let entry = this.store.get(key);
    if (!entry) {
      entry = { active: 0 };
      this.store.set(key, entry);
    }

    if (entry.active < this.options.permitLimit) {
      entry.active++;
      let disposed = false;
      return {
        isAcquired: true,
        dispose: () => {
          if (!disposed) {
            disposed = true;
            if (entry && entry.active > 0) {
              entry.active--;
            }
          }
        },
      };
    }

    return {
      isAcquired: false,
      retryAfterSeconds: 1,
      dispose: () => {},
    };
  }
}
