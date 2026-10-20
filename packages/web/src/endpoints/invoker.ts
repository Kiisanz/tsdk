import type { IEndpointRouteBuilder, EndpointType, EndpointConstructor } from './types.js';

function isEndpointConstructor(fn: any): fn is EndpointConstructor {
  if (typeof fn !== 'function') return false;
  if (fn.prototype) {
    if (
      typeof fn.prototype.mapEndpoint === 'function' ||
      typeof fn.prototype.mapEndpoints === 'function' ||
      typeof fn.prototype.map === 'function'
    ) {
      return true;
    }
  }
  const fnStr = Function.prototype.toString.call(fn);
  return /^class\s/.test(fnStr);
}

/**
 * Invokes an endpoint definition (class constructor, instance, or mapping function)
 * on the target IEndpointRouteBuilder.
 */
export function invokeEndpoint(app: IEndpointRouteBuilder, endpoint: EndpointType): void {
  if (isEndpointConstructor(endpoint)) {
    const instance = new (endpoint as any)();
    invokeEndpointInstance(app, instance);
    return;
  }

  if (typeof endpoint === 'function') {
    endpoint(app);
    return;
  }

  if (typeof endpoint === 'object' && endpoint !== null) {
    invokeEndpointInstance(app, endpoint);
    return;
  }

  throw new TypeError(`Invalid endpoint target: expected class constructor, endpoint instance, or function.`);
}

function invokeEndpointInstance(app: IEndpointRouteBuilder, instance: any): void {
  if (typeof instance.mapEndpoint === 'function') {
    instance.mapEndpoint(app);
  } else if (typeof instance.mapEndpoints === 'function') {
    instance.mapEndpoints(app);
  } else if (typeof instance.map === 'function') {
    instance.map(app);
  } else {
    throw new TypeError(
      `Endpoint instance of '${instance.constructor?.name ?? 'Object'}' must implement mapEndpoint(app: IEndpointRouteBuilder).`,
    );
  }
}
