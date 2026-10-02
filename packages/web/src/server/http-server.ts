import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { HostedService, ILogger, IServiceProviderRoot } from '@tsnx/hosting';
import { HttpContext } from '../http/http-context.js';
import { RequestDelegate } from '../middleware/pipeline.js';

export interface HttpServerOptions {
  port?: number;
  host?: string;
  maxBodySizeBytes?: number;
  /** Timeout for receiving initial request headers / body from client (defaults to 30s) */
  requestHeadersTimeoutMs?: number;
  /** Total maximum duration of a single request, 0 to disable for long streams (defaults to 0 / disabled) */
  requestTimeoutMs?: number;
}

export class HttpServerHostedService implements HostedService {
  private server?: Server;
  private readonly sockets = new Set<Socket>();
  private readonly handler: RequestDelegate;
  private rootServices?: IServiceProviderRoot;
  private readonly logger?: ILogger;
  private readonly port: number;
  private readonly host: string;
  private readonly maxBodySizeBytes: number;
  private readonly requestHeadersTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  constructor(
    handler: RequestDelegate,
    rootServices?: IServiceProviderRoot,
    options: HttpServerOptions = {},
    logger?: ILogger
  ) {
    this.handler = handler;
    this.rootServices = rootServices;
    this.port = options.port ?? 3000;
    this.host = options.host ?? '0.0.0.0';
    this.maxBodySizeBytes = options.maxBodySizeBytes ?? 1024 * 1024;
    this.requestHeadersTimeoutMs = options.requestHeadersTimeoutMs ?? 30000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 0;
    this.logger = logger;
  }

  public get listeningPort(): number | undefined {
    const address = this.server?.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return undefined;
  }

  public setRootServices(services: IServiceProviderRoot): void {
    this.rootServices = services;
  }

  public async start(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        return reject(new Error('Startup aborted'));
      }

      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleRequest(req, res);
      });

      // Configure Node.js HTTP transport timeouts:
      // headersTimeout protects from slowloris header attacks
      if (this.requestHeadersTimeoutMs > 0) {
        server.headersTimeout = this.requestHeadersTimeoutMs;
      }
      if (this.requestTimeoutMs > 0) {
        server.requestTimeout = this.requestTimeoutMs;
      }

      this.server = server;

      // Track active connections for graceful drain on stop
      server.on('connection', (socket: Socket) => {
        this.sockets.add(socket);
        socket.on('close', () => {
          this.sockets.delete(socket);
        });
      });

      const onAbort = () => {
        server.close();
        reject(new Error('Startup aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      server.on('error', (err: any) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      server.listen(this.port, this.host, () => {
        signal.removeEventListener('abort', onAbort);
        const actualPort = this.listeningPort;
        if (this.logger) {
          this.logger.info(`HTTP Server listening on http://${this.host}:${actualPort}`);
        }
        resolve();
      });
    });
  }

  public async stop(signal: AbortSignal): Promise<void> {
    if (!this.server) {
      return;
    }

    if (this.logger) {
      this.logger.info('Stopping HTTP server and draining connections...');
    }

    return new Promise<void>((resolve) => {
      // Cooperative abort listener to forcibly close idle/remaining sockets if timeout strikes
      const onAbort = () => {
        for (const socket of this.sockets) {
          socket.destroy();
        }
        resolve();
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });

      this.server!.close(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      });

      // Stop accepting new keep-alive connections on Node 18.2+
      if (typeof (this.server as any).closeIdleConnections === 'function') {
        (this.server as any).closeIdleConnections();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const abortController = new AbortController();

    // Trigger abort signal if client disconnects prematurely before response ends
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    // Request Timeout Protection (Slowloris & runaway requests)
    let timeoutTimer: NodeJS.Timeout | undefined;
    if (this.requestTimeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (!res.writableEnded) {
          if (this.logger) {
            this.logger.warn(`Request timeout reached (${this.requestTimeoutMs}ms): ${req.method} ${req.url}`);
          }
          abortController.abort();
          if (!res.headersSent) {
            res.statusCode = 408;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Request Timeout');
          } else {
            res.destroy();
          }
        }
      }, this.requestTimeoutMs);
    }

    // Create a new request-scoped DI container
    const requestScope = this.rootServices!.createScope();

    const ctx = new HttpContext(
      req,
      res,
      requestScope.serviceProvider,
      abortController.signal,
      this.maxBodySizeBytes
    );

    try {
      await this.handler(ctx);
    } catch (err: any) {
      if (this.logger) {
        this.logger.error(`Unhandled error during request processing: ${err?.stack || err?.message || err}`);
      }
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Internal Server Error');
      } else if (!res.writableEnded) {
        res.destroy(err);
      }
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      // Clean up scoped DI services deterministically after request pipeline and stream finish
      try {
        await requestScope.dispose();
      } catch (scopeErr) {
        if (this.logger) {
          this.logger.error(`Error disposing request scope: ${scopeErr}`);
        }
      }
    }
  }
}
