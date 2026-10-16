import { createToken } from '@tsnx/hosting';
import type { HttpContext } from '../http/http-context.js';
import type { RequestDelegate } from './pipeline.js';

export enum ForwardedHeaders {
  None = 0,
  XForwardedFor = 1 << 0,
  XForwardedProto = 1 << 1,
  XForwardedHost = 1 << 2,
  All = XForwardedFor | XForwardedProto | XForwardedHost,
}

export interface ForwardedHeadersOptions {
  /**
   * Identifies which forwarded headers should be processed.
   * Default: ForwardedHeaders.All
   */
  forwardedHeaders?: ForwardedHeaders;

  /**
   * Addresses of known proxies to accept forwarded headers from.
   * Default: ['127.0.0.1', '::1']
   */
  knownProxies?: string[];

  /**
   * Address ranges (CIDR notation) of known networks to accept forwarded headers from.
   * Example: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8']
   */
  knownNetworks?: string[];

  /**
   * When true, trusts all upstream proxies. Useful for containerized apps and Kubernetes pods
   * behind ingress or cloud load balancers.
   * Default: false
   */
  trustAll?: boolean;

  /**
   * Restricts the number of entries to inspect in the forwarded header.
   * Default: 1
   */
  forwardLimit?: number;

  /**
   * The allowed host values. Unmatched hosts are ignored.
   */
  allowedHosts?: string[];
}

export const FORWARDED_HEADERS_OPTIONS = createToken<ForwardedHeadersOptions>('ForwardedHeadersOptions');

function normalizeIp(ip: string): string {
  // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return 0;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  if (!network || !prefixStr) return false;
  const prefix = parseInt(prefixStr, 10);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const cleanIp = normalizeIp(ip);
  const cleanNetwork = normalizeIp(network);

  const ipNum = ipv4ToNumber(cleanIp);
  const netNum = ipv4ToNumber(cleanNetwork);

  if (prefix === 0) return true;
  const mask = ((0xffffffff << (32 - prefix)) >>> 0);
  return (ipNum & mask) === (netNum & mask);
}

export function isProxyTrusted(ip: string | undefined, options: ForwardedHeadersOptions): boolean {
  if (options.trustAll) return true;
  if (!ip) return false;

  const clean = normalizeIp(ip);
  const proxies = options.knownProxies ?? ['127.0.0.1', '::1'];
  if (proxies.some((p) => normalizeIp(p) === clean)) {
    return true;
  }

  const networks = options.knownNetworks ?? [];
  for (const cidr of networks) {
    if (isIpInCidr(clean, cidr)) {
      return true;
    }
  }

  return false;
}

/**
 * ASP.NET Core-inspired ForwardedHeadersMiddleware.
 * Applies X-Forwarded-For, X-Forwarded-Proto, and X-Forwarded-Host from reverse proxies.
 */
export function createForwardedHeadersMiddleware(options?: ForwardedHeadersOptions) {
  return async (ctx: HttpContext, next: RequestDelegate): Promise<void> => {
    let effectiveOptions = options;
    if (!effectiveOptions) {
      try {
        effectiveOptions = ctx.services.get(FORWARDED_HEADERS_OPTIONS);
      } catch {
        // Not in DI
      }
    }
    effectiveOptions = effectiveOptions ?? {};
    const flags = effectiveOptions.forwardedHeaders ?? ForwardedHeaders.All;
    const forwardLimit = effectiveOptions.forwardLimit;

    // 1. Check if direct connection IP is trusted
    const remoteIp = ctx.connection.remoteAddress;
    if (isProxyTrusted(remoteIp, effectiveOptions)) {
      const headers = ctx.request.headers;

      // 2. Process X-Forwarded-For / Forwarded for=
      if (flags & ForwardedHeaders.XForwardedFor) {
        let rawFor = headers['x-forwarded-for'];
        if (!rawFor && typeof headers['forwarded'] === 'string') {
          // RFC 7239: Forwarded: for=192.0.2.60;proto=http;by=203.0.113.43
          const match = /for="?([^";,\s]+)"?/i.exec(headers['forwarded']);
          if (match) rawFor = match[1];
        }

        if (rawFor) {
          const listStr = Array.isArray(rawFor) ? rawFor.join(',') : rawFor;
          const entries = listStr.split(',').map((s) => s.trim()).filter(Boolean);
          if (entries.length > 0) {
            let clientIp: string | undefined;
            let hops = 0;
            for (let i = entries.length - 1; i >= 0; i--) {
              if (forwardLimit !== undefined && hops >= forwardLimit) {
                break;
              }
              const candidate = normalizeIp(entries[i]);
              clientIp = candidate;
              hops++;
              // If candidate proxy is trusted, peel it and continue left to find end client
              if (!isProxyTrusted(candidate, effectiveOptions)) {
                break;
              }
            }

            if (clientIp) {
              ctx.request.setClientIp(clientIp);
              ctx.connection.remoteAddress = clientIp;
            }
          }
        }
      }

      // 3. Process X-Forwarded-Proto / Forwarded proto=
      if (flags & ForwardedHeaders.XForwardedProto) {
        let rawProto = headers['x-forwarded-proto'];
        if (!rawProto && typeof headers['forwarded'] === 'string') {
          const match = /proto=([a-z0-9+-]+)/i.exec(headers['forwarded']);
          if (match) rawProto = match[1];
        }

        if (rawProto) {
          const protoStr = Array.isArray(rawProto) ? rawProto[0] : rawProto;
          const proto = protoStr.split(',')[0].trim().toLowerCase();
          if (proto === 'http' || proto === 'https') {
            ctx.request.setScheme(proto);
          }
        }
      }

      // 4. Process X-Forwarded-Host / Forwarded host=
      if (flags & ForwardedHeaders.XForwardedHost) {
        let rawHost = headers['x-forwarded-host'];
        if (!rawHost && typeof headers['forwarded'] === 'string') {
          const match = /host="?([^";,\s]+)"?/i.exec(headers['forwarded']);
          if (match) rawHost = match[1];
        }

        if (rawHost) {
          const hostStr = Array.isArray(rawHost) ? rawHost[0] : rawHost;
          const host = hostStr.split(',')[0].trim();
          if (host) {
            if (!effectiveOptions.allowedHosts || effectiveOptions.allowedHosts.includes(host.toLowerCase())) {
              ctx.request.setHost(host);
            }
          }
        }
      }
    }

    await next(ctx);
  };
}
