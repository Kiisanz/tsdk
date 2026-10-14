import { IncomingMessage, ServerResponse, validateHeaderName, validateHeaderValue } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { IServiceProvider } from '@tsnx/hosting';

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
      throw new Error('Request aborted');
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of this.req) {
      if (this.signal.aborted) {
        throw new Error('Request aborted');
      }
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += bufferChunk.length;
      if (totalSize > this.maxBodySizeBytes) {
        const error = new Error(`Payload Too Large: exceeded maximum size of ${this.maxBodySizeBytes} bytes`);
        (error as any).statusCode = 413;
        throw error;
      }
      chunks.push(bufferChunk);
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  public async readJson<T = any>(): Promise<T> {
    const text = await this.readText();
    if (!text || text.trim().length === 0) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (err: any) {
      const error = new Error(`Malformed JSON body: ${err.message}`);
      (error as any).statusCode = 400;
      throw error;
    }
  }
}

export class HttpResponse {
  private readonly res: ServerResponse;
  private readonly reqMethod: string;
  private readonly signal: AbortSignal;

  constructor(res: ServerResponse, reqMethod: string, signal: AbortSignal) {
    this.res = res;
    this.reqMethod = reqMethod;
    this.signal = signal;
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
    if (this.hasStarted) return;
    this.statusCode = statusCode;

    // RFC compliance: 204 No Content MUST NOT send body or Content-Length
    if (statusCode === 204) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
      this.res.end();
      return;
    }

    // 304 Not Modified sends no body
    if (statusCode === 304) {
      this.res.end();
      return;
    }

    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    const json = JSON.stringify(data);
    this.setHeader('Content-Length', Buffer.byteLength(json));

    // RFC compliance: HEAD request sends headers + Content-Length, but NO body
    if (this.reqMethod === 'HEAD') {
      this.res.end();
      return;
    }

    this.res.end(json);
  }

  public async writeText(text: string, statusCode = 200, contentType = 'text/plain; charset=utf-8'): Promise<void> {
    if (this.hasStarted) return;
    this.statusCode = statusCode;

    // RFC compliance: 204 No Content
    if (statusCode === 204) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
      this.res.end();
      return;
    }

    // 304 Not Modified
    if (statusCode === 304) {
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
    if (this.hasStarted) return;
    this.statusCode = statusCode;

    // RFC compliance: 204 / 304
    if (statusCode === 204 || statusCode === 304) {
      if (statusCode === 204) {
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
    if (this.hasStarted) return;
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
