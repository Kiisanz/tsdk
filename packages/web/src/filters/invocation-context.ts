import { HttpContext } from '../http/http-context.js';
import { EndpointFilterInvocationContext } from './types.js';

export class DefaultEndpointFilterInvocationContext implements EndpointFilterInvocationContext {
  public readonly httpContext: HttpContext;
  public readonly arguments: unknown[];

  constructor(httpContext: HttpContext, args: unknown[]) {
    this.httpContext = httpContext;
    this.arguments = args;
  }

  public getArgument<T>(index: number): T {
    if (!Number.isInteger(index) || index < 0 || index >= this.arguments.length) {
      throw new RangeError(
        `Index ${index} is out of bounds for EndpointFilterInvocationContext arguments of length ${this.arguments.length}.`
      );
    }
    return this.arguments[index] as T;
  }
}
