import {
  HostApplicationBuilder,
  ServiceCollection,
  IConfiguration,
  LoggerFactory,
  IHost,
  IServiceProviderRoot,
  ServiceProviderOptions,
  HostOptions,
  Constructor,
  IServiceProvider,
} from '@tsnx/hosting';
import { HttpContext } from '../http/http-context.js';
import { RouteHandler, Results } from '../http/results.js';
import { Middleware, MiddlewarePipeline, RequestDelegate } from '../middleware/pipeline.js';
import { createExceptionHandlerMiddleware } from '../middleware/exception-handler.js';
import { Router } from '../routing/router.js';
import { HttpServerHostedService, HttpServerOptions } from '../server/http-server.js';
import {
  IExceptionHandler,
  EXCEPTION_HANDLER_TOKEN,
  ExceptionHandlerPipeline,
} from '../errors/index.js';

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

  public get hostOptions(): HostOptions {
    return this.builder.options;
  }

  public get serviceProviderOptions(): ServiceProviderOptions {
    return this.builder.serviceProviderOptions;
  }

  public configureServiceProvider(options: Partial<ServiceProviderOptions>): this {
    this.builder.configureServiceProvider(options);
    return this;
  }

  public configureServer(options: HttpServerOptions): this {
    Object.assign(this.serverOptions, options);
    return this;
  }

  public addExceptionHandler<T extends IExceptionHandler>(
    handler: Constructor<T> | ((sp: IServiceProvider) => T),
    ...dependencies: any[]
  ): this {
    this.services.addExceptionHandler(handler, ...dependencies);
    return this;
  }

  public build(options?: ServiceProviderOptions): WebApplication {
    if (options) {
      this.builder.configureServiceProvider(options);
    }
    const router = new Router();
    const pipeline = new MiddlewarePipeline();

    // Default exception handler pipeline
    const handlerDescriptors = this.builder.services.findAll(EXCEPTION_HANDLER_TOKEN);
    const logger = this.builder.logging.createLogger('ExceptionHandler');
    const isDev =
      this.builder.config.get('Environment') === 'Development' ||
      process.env.NODE_ENV === 'development';
    const exceptionPipeline = new ExceptionHandlerPipeline(handlerDescriptors, logger, {
      includeDetails: isDev,
    });
    pipeline.use(createExceptionHandlerMiddleware(exceptionPipeline));

    return new WebApplication(this.builder, router, pipeline, this.serverOptions);
  }
}

export class WebApplication {
  private readonly hostBuilder: HostApplicationBuilder;
  private readonly router: Router;
  private readonly pipeline: MiddlewarePipeline;
  private readonly initialServerOptions: HttpServerOptions;
  private effectiveServerOptions?: HttpServerOptions;
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
    this.initialServerOptions = serverOptions;
  }

  public get services(): IServiceProviderRoot {
    if (!this.appHost) {
      throw new Error('Application has not been started yet. Call start() or run() first.');
    }
    return this.appHost.services;
  }

  public get configuration(): IConfiguration {
    return this.hostBuilder.config;
  }

  public get serverOptions(): Readonly<HttpServerOptions> {
    return this.effectiveServerOptions ?? this.initialServerOptions;
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
      ctx.request.params = ctx.params;
      const result = await routingResult.match.handler(ctx);
      if (result && typeof result.executeAsync === 'function') {
        if (!ctx.response.hasStarted && !ctx.response.raw.writableEnded) {
          await result.executeAsync(ctx);
        }
      }
    };

    const finalPipeline = this.pipeline.build(routingDelegate);

    // Register HttpServerHostedService in DI and bind root provider
    const loggerFactory = this.hostBuilder.logging;
    const logger = loggerFactory.createLogger('HttpServer');

    // Default to Server configuration section if port or host omitted
    const effectiveServerOptions: HttpServerOptions = { ...this.initialServerOptions };
    const serverConfig = this.hostBuilder.config.getSection('Server');
    if (effectiveServerOptions.port === undefined) {
      const configPort = serverConfig.getNumber('Port');
      if (configPort !== undefined) {
        effectiveServerOptions.port = configPort;
      }
    }
    if (effectiveServerOptions.host === undefined) {
      const configHost = serverConfig.getString('Host');
      if (configHost !== undefined) {
        effectiveServerOptions.host = configHost;
      }
    }
    if (effectiveServerOptions.requestExecutionTimeoutMs === undefined) {
      const configTimeout = serverConfig.getNumber('RequestExecutionTimeoutMs') ?? serverConfig.getNumber('RequestTimeoutMs');
      if (configTimeout !== undefined) {
        effectiveServerOptions.requestExecutionTimeoutMs = configTimeout;
      }
    }
    if (effectiveServerOptions.shutdownDrainTimeoutMs === undefined) {
      const configDrain = serverConfig.getNumber('ShutdownDrainTimeoutMs');
      if (configDrain !== undefined) {
        effectiveServerOptions.shutdownDrainTimeoutMs = configDrain;
      }
    }

    this.effectiveServerOptions = effectiveServerOptions;

    const service = new HttpServerHostedService(finalPipeline, undefined, effectiveServerOptions, logger);
    this.serverHostedService = service;

    this.hostBuilder.services.addHostedService(() => service);

    this.appHost = this.hostBuilder.build();
    service.setRootServices(this.appHost.services);
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
