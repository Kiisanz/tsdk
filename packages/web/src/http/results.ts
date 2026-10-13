import { Readable } from 'node:stream';
import { HttpContext } from './http-context.js';
import { ProblemDetails, ProblemDetailsInput } from '../errors/types.js';
import { formatProblemDetails } from '../errors/problem-details.js';

export interface HttpResult {
  executeAsync(ctx: HttpContext): Promise<void>;
}

export type RouteHandler = (ctx: HttpContext) => HttpResult | Promise<HttpResult> | Promise<void> | void;

export class JsonResult implements HttpResult {
  constructor(
    public readonly data: any,
    public readonly statusCode: number = 200
  ) {}

  public async executeAsync(ctx: HttpContext): Promise<void> {
    await ctx.response.writeJson(this.data, this.statusCode);
  }
}

export class TextResult implements HttpResult {
  constructor(
    public readonly text: string,
    public readonly statusCode: number = 200,
    public readonly contentType: string = 'text/plain; charset=utf-8'
  ) {}

  public async executeAsync(ctx: HttpContext): Promise<void> {
    await ctx.response.writeText(this.text, this.statusCode, this.contentType);
  }
}

export class StreamResult implements HttpResult {
  constructor(
    public readonly stream: Readable,
    public readonly statusCode: number = 200,
    public readonly contentType: string = 'application/octet-stream'
  ) {}

  public async executeAsync(ctx: HttpContext): Promise<void> {
    await ctx.response.writeStream(this.stream, this.statusCode, this.contentType);
  }
}

export class StatusCodeResult implements HttpResult {
  constructor(public readonly statusCode: number) {}

  public async executeAsync(ctx: HttpContext): Promise<void> {
    await ctx.response.end(this.statusCode);
  }
}

export class ProblemResult implements HttpResult {
  public readonly problem: ProblemDetails;

  constructor(input: ProblemDetailsInput);
  constructor(title: string, statusCode?: number, detail?: string, extensions?: Record<string, any>);
  constructor(
    inputOrTitle: ProblemDetailsInput | string,
    statusCode = 500,
    detail?: string,
    extensions?: Record<string, any>
  ) {
    if (typeof inputOrTitle === 'string') {
      this.problem = formatProblemDetails(
        {
          title: inputOrTitle,
          status: statusCode,
          detail,
          extensions,
        },
        statusCode
      );
    } else {
      this.problem = formatProblemDetails(inputOrTitle, inputOrTitle.status ?? 500);
    }
  }

  public async executeAsync(ctx: HttpContext): Promise<void> {
    await ctx.response.writeProblem(this.problem);
  }
}

export class Results {
  public static json(data: any, statusCode = 200): HttpResult {
    return new JsonResult(data, statusCode);
  }

  public static ok(data?: any): HttpResult {
    return data !== undefined ? new JsonResult(data, 200) : new StatusCodeResult(200);
  }

  public static created(data?: any, location?: string): HttpResult {
    if (location) {
      return {
        async executeAsync(ctx: HttpContext): Promise<void> {
          ctx.response.setHeader('Location', location);
          if (data !== undefined) {
            await ctx.response.writeJson(data, 201);
          } else {
            await ctx.response.end(201);
          }
        }
      };
    }
    return new JsonResult(data, 201);
  }

  public static text(text: string, statusCode = 200, contentType?: string): HttpResult {
    return new TextResult(text, statusCode, contentType);
  }

  public static html(html: string, statusCode = 200): HttpResult {
    return new TextResult(html, statusCode, 'text/html; charset=utf-8');
  }

  public static stream(stream: Readable, statusCode = 200, contentType?: string): HttpResult {
    return new StreamResult(stream, statusCode, contentType);
  }

  public static noContent(): HttpResult {
    return new StatusCodeResult(204);
  }

  public static notModified(): HttpResult {
    return new StatusCodeResult(304);
  }

  public static notFound(detail?: string): HttpResult {
    return detail
      ? new ProblemResult('Not Found', 404, detail)
      : new StatusCodeResult(404);
  }

  public static badRequest(detail?: string): HttpResult {
    return detail
      ? new ProblemResult('Bad Request', 400, detail)
      : new StatusCodeResult(400);
  }

  public static status(code: number): HttpResult {
    return new StatusCodeResult(code);
  }

  public static problem(input: ProblemDetailsInput): HttpResult;
  public static problem(title: string, statusCode?: number, detail?: string, extensions?: Record<string, any>): HttpResult;
  public static problem(
    inputOrTitle: ProblemDetailsInput | string,
    statusCode?: number,
    detail?: string,
    extensions?: Record<string, any>
  ): HttpResult {
    return new ProblemResult(inputOrTitle as any, statusCode, detail, extensions);
  }

  public static validationProblem(
    errors: Record<string, string[]>,
    title = 'One or more validation errors occurred.',
    statusCode = 400
  ): HttpResult {
    return new ProblemResult({
      type: 'https://tsnx.dev/problems/validation',
      title,
      status: statusCode,
      errors,
    });
  }
}
