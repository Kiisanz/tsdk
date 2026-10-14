import { IncomingMessage, ServerResponse, validateHeaderName, validateHeaderValue } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { IServiceProvider } from '@tsnx/hosting';
import { bindBody } from '../binding/body-binder.js';
import { bindQuery } from '../binding/query-binder.js';
import { bindRoute } from '../binding/route-binder.js';
import { BindingSchema, Infer } from '../binding/types.js';
import { RequestBindingException } from '../binding/binding-error.js';
import { ProblemDetailsInput, BadHttpRequestException } from '../errors/types.js';
import { formatProblemDetails } from '../errors/problem-details.js';

export class HttpRequest {
  public readonly method: string;
  public readonly url: string;
  public readonly path: string;
  public readonly query: URLSearchParams;
  public readonly headers: IncomingMessage['headers'];
  public readonly signal: AbortSignal;
  private readonly req: IncomingMessage;
  private readonly maxBodySizeBytes: number;

  constructor(req: IncomingMessage, signal: AbortSignal, maxBodySizeBytes = 1024 * 1024) {
    this.req = req;
    this.signal = signal;
    this.method = (req.method ?? 'GET').toUpperCase();
    this.url = req.url ?? '/';
    this.headers = req.headers;
    this.maxBodySizeBytes = maxBodySizeBytes;

    const dummyHost = req.headers.host ? `http://${req.headers.host}` : 'http://localhost';
    try {
      const parsedUrl = new URL(this.url, dummyHost);
      this.path = parsedUrl.pathname;
      this.query = parsedUrl.searchParams;
    } catch {
      this.path = this.url.split('?')[0] || '/';
      this.query = new URLSearchParams();
    }
  }

  public get raw(): IncomingMessage {
    return this.req;
  }

  public async readText(): Promise<string> {
    if (this.signal.aborted) {
      throw this.signal.reason ?? new DOMException('Request aborted', 'AbortError');
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of this.req) {
      if (this.signal.aborted) {
        throw this.signal.reason ?? new DOMException('Request aborted', 'AbortError');
      }
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += bufferChunk.length;
      if (totalSize > this.maxBodySizeBytes) {
        throw new BadHttpRequestException(
          `Payload Too Large: exceeded maximum size of ${this.maxBodySizeBytes} bytes`,
          413
        );
      }
      chunks.push(bufferChunk);
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  public params: Record<string, string> = {};

  public async readJson<T = any>(): Promise<T> {
    const text = await this.readText();
    if (!text || text.trim().length === 0) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (err: any) {
      throw new BadHttpRequestException(`Malformed JSON body: ${err.message}`, 400);
    }
  }

  public async bindBody<T extends BindingSchema>(schema: T): Promise<Infer<T>> {
    let rawJson: unknown;
    try {
      rawJson = await this.readJson<unknown>();
    } catch (err: unknown) {
      if (err instanceof BadHttpRequestException && err.statusCode === 400) {
        throw new RequestBindingException([
          {
            source: 'body',
            path: '$',
            message: err.message,
          },
        ]);
      }
      throw err;
    }
    return bindBody(schema, rawJson);
  }

  public bindQuery<T extends BindingSchema>(schema: T): Infer<T> {
    return bindQuery(schema, this.query);
  }

  public bindRoute<T extends BindingSchema>(schema: T): Infer<T> {
    return bindRoute(schema, this.params);
  }
}

export type LifecycleCallback = () => void | Promise<void>;

export class InvalidResponseStateException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResponseStateException';
  }
}

export class HttpResponse {
  private readonly res: ServerResponse;
  private readonly reqMethod: string;
  private readonly signal: AbortSignal;
  private readonly startingCallbacks: LifecycleCallback[] = [];
  private readonly completedCallbacks: LifecycleCallback[] = [];
  private startingPromise?: Promise<void>;
  private completedPromise?: Promise<void>;
  private startingFired = false;
  private completedFired = false;
  private isWriting = false;

  constructor(res: ServerResponse, reqMethod: string, signal: AbortSignal) {
    this.res = res;
    this.reqMethod = reqMethod;
    this.signal = signal;
  }

  private prepareWrite(): boolean {
    // 1. Silent suppression if canceled/aborted externally or already ended
    if (this.signal.aborted || this.res.writableEnded) {
      return false;
    }

    // 2. Concurrency bug in developer code: throw explicit exception
    if (this.isWriting) {
      throw new InvalidResponseStateException(
        'Cannot start another write while a response write is already in progress.'
      );
    }

    // 3. Headers already sent on an active response
    if (this.hasStarted) {
      throw new InvalidResponseStateException(
        'Cannot start response: headers have already been sent.'
      );
    }

    this.isWriting = true;
    return true;
  }

  public onStarting(callback: LifecycleCallback): void {
    if (this.startingFired || this.hasStarted || this.res.writableEnded) {
      throw new Error('Cannot register onStarting callback after response has started.');
    }
    this.startingCallbacks.push(callback);
  }

  public onCompleted(callback: LifecycleCallback): void {
    if (this.completedFired) {
      throw new Error('Cannot register onCompleted callback after response has completed.');
    }
    this.completedCallbacks.push(callback);
  }

  public async fireStarting(): Promise<void> {
    if (this.startingFired) {
      return;
    }
    if (this.startingPromise) {
      await this.startingPromise;
      return;
    }
    this.startingPromise = (async () => {
      for (const cb of this.startingCallbacks) {
        await cb();
      }
      this.startingFired = true;
    })();
    await this.startingPromise;
  }

  public async fireCompleted(): Promise<void> {
    if (this.completedFired) {
      return;
    }
    if (this.completedPromise) {
      await this.completedPromise;
      return;
    }
    this.completedPromise = (async () => {
      for (const cb of this.completedCallbacks) {
        try {
          await cb();
        } catch {
          // Exceptions from onCompleted must not cause secondary response or crash
        }
      }
      this.completedFired = true;
    })();
    await this.completedPromise;
  }

  public get raw(): ServerResponse {
    return this.res;
  }

  public get statusCode(): number {
    return this.res.statusCode;
  }

  public set statusCode(code: number) {
    this.res.statusCode = code;
  }

  public get hasStarted(): boolean {
    return this.res.headersSent;
  }

  public setHeader(name: string, value: string | number | readonly string[]): this {
    if (this.res.headersSent) {
      return this;
    }

    // Native Node.js HTTP header validation (RFC conformant)
    validateHeaderName(name);
    if (Array.isArray(value)) {
      for (const item of value) {
        validateHeaderValue(name, item);
      }
    } else {
      validateHeaderValue(name, value as any);
    }

    this.res.setHeader(name, value);
    return this;
  }

  public getHeader(name: string): string | number | readonly string[] | undefined {
    return this.res.getHeader(name);
  }

  public removeHeader(name: string): this {
    if (!this.res.headersSent) {
      this.res.removeHeader(name);
    }
    return this;
  }

  public async writeJson(data: any, statusCode = 200): Promise<void> {
    if (!this.prepareWrite()) return;

    await this.fireStarting();
    if (this.signal.aborted || this.res.writableEnded) return;

    this.statusCode = statusCode;

    // RFC compliance: 204 No Content MUST NOT send body or Content-Length
    if (this.statusCode === 204) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
      this.res.end();
      return;
    }

    // 304 Not Modified sends no body
    if (this.statusCode === 304) {
      this.res.end();
      return;
    }

    if (!this.getHeader('Content-Type')) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    const json = JSON.stringify(data);
    this.setHeader('Content-Length', Buffer.byteLength(json));

    // RFC compliance: HEAD request sends headers + Content-Length, but NO body
    if (this.reqMethod === 'HEAD') {
      this.res.end();
      return;
    }

    this.res.end(json);
  }

  public async writeProblem(input: ProblemDetailsInput): Promise<void> {
    if (this.res.headersSent || this.res.writableEnded) {
      return;
    }
    const problem = formatProblemDetails(input);
    this.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    await this.writeJson(problem, problem.status);
  }

  public async writeText(text: string, statusCode = 200, contentType = 'text/plain; charset=utf-8'): Promise<void> {
    if (!this.prepareWrite()) return;

    await this.fireStarting();
    if (this.signal.aborted || this.res.writableEnded) return;

    this.statusCode = statusCode;

    // RFC compliance: 204 No Content
    if (this.statusCode === 204) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
      this.res.end();
      return;
    }

    // 304 Not Modified
    if (this.statusCode === 304) {
      this.res.end();
      return;
    }

    this.setHeader('Content-Type', contentType);
    this.setHeader('Content-Length', Buffer.byteLength(text));

    // RFC compliance: HEAD request
    if (this.reqMethod === 'HEAD') {
      this.res.end();
      return;
    }

    this.res.end(text);
  }

  public async writeStream(stream: Readable, statusCode = 200, contentType = 'application/octet-stream'): Promise<void> {
    if (!this.prepareWrite()) return;

    await this.fireStarting();
    if (this.signal.aborted || this.res.writableEnded) return;

    this.statusCode = statusCode;

    // RFC compliance: 204 / 304
    if (this.statusCode === 204 || this.statusCode === 304) {
      if (this.statusCode === 204) {
        this.removeHeader('Content-Type');
        this.removeHeader('Content-Length');
      }
      stream.destroy();
      this.res.end();
      return;
    }

    this.setHeader('Content-Type', contentType);

    // RFC compliance: HEAD request sends headers without streaming body
    if (this.reqMethod === 'HEAD') {
      stream.destroy();
      this.res.end();
      return;
    }

    // Stream with backpressure and client abort handling.
    // Awaits until stream finishes completely before releasing execution flow.
    try {
      await pipeline(stream, this.res, { signal: this.signal });
    } catch (err: any) {
      stream.destroy();
      if (!this.res.writableEnded) {
        this.res.destroy(err);
      }
    }
  }

  public async end(statusCode?: number): Promise<void> {
    if (!this.prepareWrite()) return;

    await this.fireStarting();
    if (this.signal.aborted || this.res.writableEnded) return;

    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }

    if (this.statusCode === 204) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
    }

    this.res.end();
  }
}

export class HttpContext {
  public readonly request: HttpRequest;
  public readonly response: HttpResponse;
  public readonly services: IServiceProvider;
  public get requestServices(): IServiceProvider {
    return this.services;
  }
  public readonly items: Map<string, any> = new Map();
  public params: Record<string, string> = {};

  constructor(
    req: IncomingMessage,
    res: ServerResponse,
    services: IServiceProvider,
    abortSignal: AbortSignal,
    maxBodySizeBytes?: number
  ) {
    this.request = new HttpRequest(req, abortSignal, maxBodySizeBytes);
    this.response = new HttpResponse(res, this.request.method, abortSignal);
    this.services = services;
  }
}
