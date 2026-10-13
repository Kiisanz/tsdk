import {
  HostApplicationBuilder,
  ServiceCollection,
  IConfiguration,
  LoggerFactory,
  ILoggerFactory,
  HOSTED_SERVICE_TOKEN,
  IHost,
  IServiceProvider,
} from '@tsdk/hosting';
import { HttpContext } from '../http/http-context.js';
import { RouteHandler, Results } from '../http/results.js';
import { Middleware, MiddlewarePipeline, RequestDelegate } from '../middleware/pipeline.js';
import { createExceptionHandlerMiddleware } from '../middleware/exception-handler.js';
import { Router } from '../routing/router.js';
import { HttpServerHostedService, HttpServerOptions } from '../server/http-server.js';

export class WebApplicationBuilder {
  private readonly builder: HostApplicationBuilder;
  private readonly serverOptions: HttpServerOptions = {};

  constructor(args: string[] = []) {
    this.builder = new HostApplicationBuilder(args);
  }

  public get services(): ServiceCollection {
    return this.builder.services;
  }

  public get configuration(): IConfiguration {
    return this.builder.config;
  }

  public get logging(): LoggerFactory {
    return this.builder.logging;
  }

  public configureServer(options: HttpServerOptions): this {
    Object.assign(this.serverOptions, options);
    return this;
  }

  public build(): WebApplication {
    const router = new Router();
    const pipeline = new MiddlewarePipeline();

    // Default exception handler
    pipeline.use(createExceptionHandlerMiddleware());

    return new WebApplication(this.builder, router, pipeline, this.serverOptions);
  }
}

export class WebApplication {
  private readonly hostBuilder: HostApplicationBuilder;
  private readonly router: Router;
  private readonly pipeline: MiddlewarePipeline;
  private readonly serverOptions: HttpServerOptions;
  private appHost?: IHost;
  private serverHostedService?: HttpServerHostedService;

  constructor(
    hostBuilder: HostApplicationBuilder,
    router: Router,
    pipeline: MiddlewarePipeline,
    serverOptions: HttpServerOptions
  ) {
    this.hostBuilder = hostBuilder;
    this.router = router;
    this.pipeline = pipeline;
    this.serverOptions = serverOptions;
  }

  public get services(): IServiceProvider {
    if (!this.appHost) {
      throw new Error('Application has not been started yet. Call start() or run() first.');
    }
    return this.appHost.services;
  }

  public get configuration(): IConfiguration {
    return this.hostBuilder.config;
  }

  public get listeningPort(): number | undefined {
    return this.serverHostedService?.listeningPort;
  }

  public use(middleware: Middleware): this {
    this.pipeline.use(middleware);
    return this;
  }

  public mapGet(pattern: string, handler: RouteHandler): this {
    this.router.get(pattern, handler);
    return this;
  }

  public mapPost(pattern: string, handler: RouteHandler): this {
    this.router.post(pattern, handler);
    return this;
  }

  public mapPut(pattern: string, handler: RouteHandler): this {
    this.router.put(pattern, handler);
    return this;
  }

  public mapDelete(pattern: string, handler: RouteHandler): this {
    this.router.delete(pattern, handler);
    return this;
  }

  public mapPatch(pattern: string, handler: RouteHandler): this {
    this.router.patch(pattern, handler);
    return this;
  }

  private initHost(): void {
    if (this.appHost) return;

    // Terminal endpoint routing delegate
    const routingDelegate: RequestDelegate = async (ctx: HttpContext) => {
      const routingResult = this.router.match(ctx.request.method, ctx.request.path);

      if (routingResult.type === 'bad_request') {
        const result = Results.badRequest(routingResult.error);
        await result.executeAsync(ctx);
        return;
      }

      if (routingResult.type === 'not_found') {
        const result = Results.notFound(`No route found for [${ctx.request.method}] ${ctx.request.path}`);
        await result.executeAsync(ctx);
        return;
      }

      if (routingResult.type === 'options') {
        ctx.response.setHeader('Allow', routingResult.allowedMethods.join(', '));
        await ctx.response.end(204);
        return;
      }

      if (routingResult.type === 'method_not_allowed') {
        ctx.response.setHeader('Allow', routingResult.allowedMethods.join(', '));
        ctx.response.statusCode = 405;
        await ctx.response.writeJson({
          title: 'Method Not Allowed',
          status: 405,
          detail: `HTTP Method ${ctx.request.method} is not allowed on ${ctx.request.path}. Allowed: ${routingResult.allowedMethods.join(', ')}`,
        }, 405);
        return;
      }

      // Route matched
      ctx.params = routingResult.match.params;
      const result = await routingResult.match.handler(ctx);
      if (result && typeof result.executeAsync === 'function') {
        await result.executeAsync(ctx);
      }
    };

    const finalPipeline = this.pipeline.build(routingDelegate);

    // Register HttpServerHostedService in DI
    this.hostBuilder.services.addSingleton(HOSTED_SERVICE_TOKEN, (sp: IServiceProvider) => {
      const loggerFactory = sp.getOptional<ILoggerFactory>(LoggerFactory);
      const logger = loggerFactory?.createLogger('HttpServer');
      const service = new HttpServerHostedService(finalPipeline, sp, this.serverOptions, logger);
      this.serverHostedService = service;
      return service;
    });

    this.appHost = this.hostBuilder.build();
  }

  public async start(): Promise<void> {
    this.initHost();
    await this.appHost!.start();
  }

  public async stop(): Promise<void> {
    if (this.appHost) {
      await this.appHost.stop();
    }
  }

  public async run(): Promise<void> {
    this.initHost();
    await this.appHost!.run();
  }

  public static createBuilder(args: string[] = []): WebApplicationBuilder {
    return new WebApplicationBuilder(args);
  }
}
