import { RouteHandler } from '../http/results.js';
import { RouteHandlerBuilder } from '../filters/route-handler-builder.js';
import { EndpointArgumentDescriptor } from '../descriptors/types.js';

interface RouteSegment {
  isParam: boolean;
  value: string;
}

interface RouteEntry {
  method: string;
  pattern: string;
  segments: RouteSegment[];
  handler: (...args: any[]) => any;
  descriptors?: readonly EndpointArgumentDescriptor[];
  builder?: RouteHandlerBuilder;
}

export interface RouteMatch {
  handler: (...args: any[]) => any;
  params: Record<string, string>;
  descriptors?: readonly EndpointArgumentDescriptor[];
  builder?: RouteHandlerBuilder;
  isHeadAuto?: boolean;
}

export type RoutingResult =
  | { type: 'match'; match: RouteMatch }
  | { type: 'options'; allowedMethods: string[] }
  | { type: 'method_not_allowed'; allowedMethods: string[] }
  | { type: 'not_found' }
  | { type: 'bad_request'; error: string };

function parsePattern(pattern: string): RouteSegment[] {
  const normalized = pattern.startsWith('/') ? pattern : `/${pattern}`;
  const rawSegments = normalized.split('/').filter(s => s.length > 0);
  return rawSegments.map(seg => {
    if (seg.startsWith(':')) {
      return { isParam: true, value: seg.substring(1) };
    }
    return { isParam: false, value: seg };
  });
}

function normalizePath(path: string): string[] {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.split('/').filter(s => s.length > 0);
}

export class Router {
  private readonly routes: RouteEntry[] = [];

  public map(
    method: string,
    pattern: string,
    handler: (...args: any[]) => any,
    descriptors?: readonly EndpointArgumentDescriptor[],
    builder?: RouteHandlerBuilder
  ): this {
    const upperMethod = method.toUpperCase();
    const normalizedPattern = pattern.startsWith('/') ? pattern : `/${pattern}`;

    // Check duplicate method + pattern registration
    const duplicate = this.routes.find(r => r.method === upperMethod && r.pattern === normalizedPattern);
    if (duplicate) {
      throw new Error(`Duplicate route registration: [${upperMethod}] ${normalizedPattern} already registered.`);
    }

    const segments = parsePattern(normalizedPattern);
    this.routes.push({
      method: upperMethod,
      pattern: normalizedPattern,
      segments,
      handler,
      descriptors,
      builder,
    });

    // Sort routes: static segments have higher priority than parameter segments
    this.routes.sort((a, b) => {
      const minLen = Math.min(a.segments.length, b.segments.length);
      for (let i = 0; i < minLen; i++) {
        const aParam = a.segments[i].isParam;
        const bParam = b.segments[i].isParam;
        if (!aParam && bParam) return -1;
        if (aParam && !bParam) return 1;
      }
      return b.segments.length - a.segments.length;
    });

    return this;
  }

  public get(pattern: string, handler: RouteHandler): this {
    return this.map('GET', pattern, handler);
  }

  public post(pattern: string, handler: RouteHandler): this {
    return this.map('POST', pattern, handler);
  }

  public put(pattern: string, handler: RouteHandler): this {
    return this.map('PUT', pattern, handler);
  }

  public delete(pattern: string, handler: RouteHandler): this {
    return this.map('DELETE', pattern, handler);
  }

  public patch(pattern: string, handler: RouteHandler): this {
    return this.map('PATCH', pattern, handler);
  }

  public options(pattern: string, handler: RouteHandler): this {
    return this.map('OPTIONS', pattern, handler);
  }

  public head(pattern: string, handler: RouteHandler): this {
    return this.map('HEAD', pattern, handler);
  }

  public match(method: string, pathname: string): RoutingResult {
    const upperMethod = method.toUpperCase();
    const pathSegments = normalizePath(pathname);

    const patternMatchedRoutes: { route: RouteEntry; params: Record<string, string> }[] = [];
    let malformedUrlError: string | null = null;

    for (const route of this.routes) {
      if (route.segments.length !== pathSegments.length) {
        continue;
      }

      let matches = true;
      const params: Record<string, string> = {};

      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        const actual = pathSegments[i];

        if (seg.isParam) {
          try {
            params[seg.value] = decodeURIComponent(actual);
          } catch {
            malformedUrlError = `Malformed URL encoding in parameter segment: ${actual}`;
            matches = false;
            break;
          }
        } else {
          if (seg.value !== actual) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        patternMatchedRoutes.push({ route, params });
      }
    }

    if (malformedUrlError) {
      return { type: 'bad_request', error: malformedUrlError };
    }

    if (patternMatchedRoutes.length === 0) {
      return { type: 'not_found' };
    }

    // 1. Direct match for requested HTTP method
    const exactMatch = patternMatchedRoutes.find(m => m.route.method === upperMethod);
    if (exactMatch) {
      return {
        type: 'match',
        match: {
          handler: exactMatch.route.handler,
          params: exactMatch.params,
          descriptors: exactMatch.route.descriptors,
          builder: exactMatch.route.builder,
        },
      };
    }

    // 2. HTTP RFC: Automatic HEAD fallback to GET if HEAD was not explicitly mapped
    if (upperMethod === 'HEAD') {
      const getMatch = patternMatchedRoutes.find(m => m.route.method === 'GET');
      if (getMatch) {
        return {
          type: 'match',
          match: {
            handler: getMatch.route.handler,
            params: getMatch.params,
            descriptors: getMatch.route.descriptors,
            builder: getMatch.route.builder,
            isHeadAuto: true,
          },
        };
      }
    }

    // 3. HTTP RFC: Automatic OPTIONS fallback if OPTIONS was not explicitly mapped
    const allowedMethodsSet = new Set(patternMatchedRoutes.map(m => m.route.method));
    // If GET is allowed, HEAD is also implicitly allowed
    if (allowedMethodsSet.has('GET')) {
      allowedMethodsSet.add('HEAD');
    }
    allowedMethodsSet.add('OPTIONS');
    const allowedMethods = Array.from(allowedMethodsSet).sort();

    if (upperMethod === 'OPTIONS') {
      return {
        type: 'options',
        allowedMethods,
      };
    }

    // Path matches pattern, but method not allowed -> 405 with Allow header
    return {
      type: 'method_not_allowed',
      allowedMethods,
    };
  }
}
