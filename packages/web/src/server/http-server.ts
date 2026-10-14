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
  /** Total maximum duration of handler execution, 0 to disable (defaults to 0 / disabled) */
  requestExecutionTimeoutMs?: number;
  /** Legacy alias for requestExecutionTimeoutMs */
  requestTimeoutMs?: number;
  /** Graceful drain timeout when server is stopping (defaults to 10s) */
  shutdownDrainTimeoutMs?: number;
}

interface ActiveRequestEntry {
  abortController: AbortController;
  res: ServerResponse;
}

export class HttpServerHostedService implements HostedService {
  private server?: Server;
  private readonly sockets = new Set<Socket>();
  private readonly activeRequests = new Set<ActiveRequestEntry>();
  private drainResolver?: () => void;
  private readonly handler: RequestDelegate;
  private rootServices?: IServiceProviderRoot;
  private readonly logger?: ILogger;
  private readonly port: number;
  private readonly host: string;
  private readonly maxBodySizeBytes: number;
  private readonly requestHeadersTimeoutMs: number;
  private readonly requestExecutionTimeoutMs: number;
  private readonly shutdownDrainTimeoutMs: number;

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
    this.requestExecutionTimeoutMs = options.requestExecutionTimeoutMs ?? options.requestTimeoutMs ?? 0;
    this.shutdownDrainTimeoutMs = options.shutdownDrainTimeoutMs ?? 10000;
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

    const server = this.server;

    return new Promise<void>((resolve) => {
      let isDone = false;
      let drainTimeoutTimer: NodeJS.Timeout | undefined;

      const finish = () => {
        if (!isDone) {
          isDone = true;
          if (drainTimeoutTimer) {
            clearTimeout(drainTimeoutTimer);
          }
          signal.removeEventListener('abort', onAbort);
          this.drainResolver = undefined;
          resolve();
        }
      };

      const onAbort = () => {
        // Drain timeout expired or stop signal aborted: forcibly cancel remaining requests
        const shutdownReason = new DOMException('Server shutdown drain timeout exceeded', 'AbortError');
        for (const reqEntry of this.activeRequests) {
          reqEntry.abortController.abort(shutdownReason);
          if (!reqEntry.res.headersSent) {
            reqEntry.res.statusCode = 503;
            reqEntry.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            reqEntry.res.end('Server Shutting Down');
          } else if (!reqEntry.res.writableEnded) {
            reqEntry.res.destroy(shutdownReason);
          }
        }

        // Force destroy all lingering sockets
        for (const socket of this.sockets) {
          socket.destroy();
        }
        finish();
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });

      // 1. Stop accepting new incoming connections
      server.close(() => {
        finish();
      });

      // 2. Close idle keep-alive connections immediately
      if (typeof (server as any).closeIdleConnections === 'function') {
        (server as any).closeIdleConnections();
      }

      // 3. Graceful drain: wait for in-flight requests or drain timeout
      if (this.activeRequests.size > 0) {
        if (this.logger) {
          this.logger.info(`Waiting for ${this.activeRequests.size} active request(s) to drain (timeout: ${this.shutdownDrainTimeoutMs}ms)...`);
        }

        drainTimeoutTimer = setTimeout(onAbort, this.shutdownDrainTimeoutMs);

        this.drainResolver = () => {
          if (this.activeRequests.size === 0) {
            if (drainTimeoutTimer) {
              clearTimeout(drainTimeoutTimer);
            }
            this.drainResolver = undefined;
            // Close remaining connections so server.close callback triggers
            if (typeof (server as any).closeIdleConnections === 'function') {
              (server as any).closeIdleConnections();
            }
            for (const socket of this.sockets) {
              socket.destroy();
            }
          }
        };
      } else {
        // No active requests; close remaining sockets
        for (const socket of this.sockets) {
          socket.destroy();
        }
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const abortController = new AbortController();
    const requestEntry: ActiveRequestEntry = { abortController, res };
    this.activeRequests.add(requestEntry);

    // Create a new request-scoped DI container
    const requestScope = this.rootServices!.createScope();

    const ctx = new HttpContext(
      req,
      res,
      requestScope.serviceProvider,
      abortController.signal,
      this.maxBodySizeBytes
    );

    // Client Disconnect Detection:
    // In Node.js, res.on('close') fires when underlying socket closes.
    // If !res.writableFinished, connection closed prematurely before response completion.
    // Normal response completion (writableFinished === true) MUST NOT abort the signal.
    const onTsnxClose = () => {
      if (!res.writableFinished) {
        if (!abortController.signal.aborted) {
          abortController.abort(new DOMException('Client disconnected', 'AbortError'));
        }
      }
      ctx.response.fireCompleted();
    };

    const onTsnxFinish = () => {
      ctx.response.fireCompleted();
    };

    res.on('close', onTsnxClose);
    res.on('finish', onTsnxFinish);

    // Request Execution Timeout (handler duration protection)
    let timeoutTimer: NodeJS.Timeout | undefined;
    if (this.requestExecutionTimeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (!res.writableFinished) {
          if (this.logger) {
            this.logger.warn(`Request execution timeout reached (${this.requestExecutionTimeoutMs}ms): ${req.method} ${req.url}`);
          }
          const timeoutReason = new DOMException('Request execution timed out', 'TimeoutError');
          abortController.abort(timeoutReason);
          if (!res.headersSent) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
            res.end(JSON.stringify({
              type: 'https://tsnx.dev/problems/timeout',
              title: 'Service Unavailable',
              status: 503,
              detail: `The request execution exceeded timeout of ${this.requestExecutionTimeoutMs}ms.`,
            }));
          } else {
            res.destroy(timeoutReason);
          }
          ctx.response.fireCompleted();
        }
      }, this.requestExecutionTimeoutMs);
    }

    // Lifecycle Architecture Guarantee:
    // - Response Completion: Occurs independently when response headers/body finish (or on timeout/disconnect).
    // - Handler Completion: Framework awaits this.handler(ctx) until it settles.
    // - Scoped DI Disposal: Deferred to finally block AFTER this.handler(ctx) settles to prevent
    //   premature disposal while in-flight operations are still actively using scoped dependencies.
    // Trade-off Note: If an uncooperative handler never settles (e.g. pending Promise indefinitely),
    // its scope remains allocated until host shutdown. During host stop(), shutdownDrainTimeoutMs guarantees
    // the server terminates connections without hanging indefinitely.
    try {
      await this.handler(ctx);
    } catch (err: any) {
      if (res.writableFinished) {
        return;
      }
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.destroy(err);
        }
        return;
      }
      // Check if client disconnected - suppress noisy 500
      if (abortController.signal.aborted && abortController.signal.reason?.name === 'AbortError') {
        if (this.logger) {
          this.logger.debug?.(`Request aborted by client: ${req.method} ${req.url}`);
        }
      } else if (abortController.signal.aborted && abortController.signal.reason?.name === 'TimeoutError') {
        if (this.logger) {
          this.logger.warn(`Request execution timed out: ${req.method} ${req.url}`);
        }
      } else {
        if (this.logger) {
          this.logger.error(`Unhandled error during request processing: ${err?.stack || err?.message || err}`);
        }
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Internal Server Error');
      }
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }

      res.removeListener('close', onTsnxClose);
      res.removeListener('finish', onTsnxFinish);

      // 1. Run onCompleted callbacks (scoped DI is still available during completion)
      try {
        await ctx.response.fireCompleted();
      } catch (completedErr) {
        if (this.logger) {
          this.logger.error(`Error in onCompleted callback: ${completedErr}`);
        }
      }

      // 2. Remove from active in-flight requests and check graceful drain
      this.activeRequests.delete(requestEntry);
      if (this.activeRequests.size === 0 && this.drainResolver) {
        this.drainResolver();
      }

      // 3. Clean up scoped DI services deterministically AFTER handler has finished
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
