import { HttpContext } from '../http/http-context.js';

export type RequestDelegate = (ctx: HttpContext) => Promise<void>;
export type Middleware = (ctx: HttpContext, next: RequestDelegate) => Promise<void>;

export class MiddlewarePipeline {
  private readonly middlewares: Middleware[] = [];

  public use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  public build(fallback: RequestDelegate): RequestDelegate {
    let next: RequestDelegate = fallback;

    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const currentMiddleware = this.middlewares[i];
      const nextDelegate = next;

      next = async (ctx: HttpContext): Promise<void> => {
        let nextCalled = false;
        await currentMiddleware(ctx, async (c: HttpContext) => {
          if (nextCalled) {
            throw new Error('Invalid operation: next() was already called within this middleware.');
          }
          nextCalled = true;
          return nextDelegate(c);
        });
      };
    }

    return next;
  }
}
