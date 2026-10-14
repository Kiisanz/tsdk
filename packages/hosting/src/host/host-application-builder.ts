import * as path from 'node:path';
import { Configuration } from '../config/configuration.js';
import { CommandLineConfigurationProvider } from '../config/providers/command-line-provider.js';
import { EnvironmentVariablesConfigurationProvider } from '../config/providers/env-provider.js';
import { JsonConfigurationProvider } from '../config/providers/json-provider.js';
import { MemoryConfigurationProvider } from '../config/providers/memory-provider.js';
import { ServiceCollection } from '../di/service-collection.js';
import { IServiceProvider, ServiceProviderOptions } from '../di/types.js';
import { HostedService, HOSTED_SERVICE_TOKEN } from '../hosted-services/types.js';
import { HostApplicationLifetime, HostLifecycleCoordinator } from '../lifecycle/host-lifetime.js';
import { LoggerFactory } from '../logging/console-logger.js';
import { LogLevel } from '../logging/types.js';
import { STARTUP_VALIDATOR_TOKEN } from '../options/startup-validator.js';
import { AppHost } from './app-host.js';
import { HostApplicationBuilderSettings, HostOptions, IHost } from './types.js';

export class HostApplicationBuilder {
  public readonly services = new ServiceCollection();
  public readonly config = new Configuration();
  public readonly logging = new LoggerFactory(LogLevel.Information);
  public readonly options: HostOptions = {};
  public readonly serviceProviderOptions: ServiceProviderOptions = {};

  public get configuration(): Configuration {
    return this.config;
  }

  constructor(argsOrSettings: string[] | HostApplicationBuilderSettings = []) {
    let args: string[] = [];
    let env = process.env.NODE_ENV || 'development';
    let contentRoot = process.cwd();

    if (Array.isArray(argsOrSettings)) {
      args = argsOrSettings;
    } else if (argsOrSettings && typeof argsOrSettings === 'object') {
      args = argsOrSettings.args ?? [];
      env = argsOrSettings.environment ?? process.env.NODE_ENV ?? 'development';
      contentRoot = argsOrSettings.contentRootPath ?? process.cwd();
      if (argsOrSettings.contentRootPath) {
        this.options.contentRootPath = argsOrSettings.contentRootPath;
      }
      if (argsOrSettings.serviceProviderOptions) {
        Object.assign(this.serviceProviderOptions, argsOrSettings.serviceProviderOptions);
      }
    }

    if (process.env.TSNX_CONTENTROOT) {
      contentRoot = process.env.TSNX_CONTENTROOT;
      this.options.contentRootPath = contentRoot;
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--contentRoot=') || arg.startsWith('--ContentRoot=')) {
        contentRoot = arg.slice(arg.indexOf('=') + 1);
        this.options.contentRootPath = contentRoot;
      } else if (arg === '--contentRoot' || arg === '--ContentRoot') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          contentRoot = args[i + 1];
          this.options.contentRootPath = contentRoot;
        }
      } else if (arg.startsWith('--contentRootPath=') || arg.startsWith('--ContentRootPath=')) {
        contentRoot = arg.slice(arg.indexOf('=') + 1);
        this.options.contentRootPath = contentRoot;
      } else if (arg === '--contentRootPath' || arg === '--ContentRootPath') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          contentRoot = args[i + 1];
          this.options.contentRootPath = contentRoot;
        }
      } else if (arg.startsWith('--environment=') || arg.startsWith('--Environment=')) {
        env = arg.slice(arg.indexOf('=') + 1);
      } else if (arg === '--environment' || arg === '--Environment') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          env = args[i + 1];
        }
      }
    }

    // 1. Setup Ordered Configuration Providers:
    // Defaults -> JSON -> Environment Variables -> CLI Arguments
    this.config.addProvider(new MemoryConfigurationProvider({ environment: env }));
    this.config.addProvider(new JsonConfigurationProvider(path.join(contentRoot, 'appsettings.json'), true));
    this.config.addProvider(new JsonConfigurationProvider(path.join(contentRoot, `appsettings.${env}.json`), true));
    this.config.addProvider(new EnvironmentVariablesConfigurationProvider());
    this.config.addProvider(new CommandLineConfigurationProvider(args));

    // 2. Pre-register core hosting services into DI
    this.services.addSingleton(Configuration, () => this.config);
    this.services.addSingleton(LoggerFactory, () => this.logging);
  }

  setContentRoot(contentRootPath: string): this {
    this.options.contentRootPath = contentRootPath;
    const env = process.env.NODE_ENV || 'development';
    this.config.addProvider(new JsonConfigurationProvider(path.join(contentRootPath, 'appsettings.json'), true));
    this.config.addProvider(new JsonConfigurationProvider(path.join(contentRootPath, `appsettings.${env}.json`), true));
    return this;
  }

  configureServiceProvider(options: Partial<ServiceProviderOptions>): this {
    Object.assign(this.serviceProviderOptions, options);
    return this;
  }

  addHostedService<T extends HostedService>(factory: (sp: IServiceProvider) => T): this {
    this.services.addHostedService(factory);
    return this;
  }

  build(options?: ServiceProviderOptions): IHost {
    const lifetime = new HostApplicationLifetime();
    this.services.addSingleton(HostApplicationLifetime, () => lifetime);

    const spOptions: ServiceProviderOptions = {
      ...this.options.serviceProviderOptions,
      ...this.serviceProviderOptions,
      ...options,
    };

    const serviceProvider = this.services.buildServiceProvider(spOptions);

    // Resolve hosted services from DI container
    const hostedServices: HostedService[] = [];
    const registeredHostedDescriptors = this.services.findAll(HOSTED_SERVICE_TOKEN);
    for (const desc of registeredHostedDescriptors) {
      if (desc.instance) {
        hostedServices.push(desc.instance);
      } else if (desc.factory) {
        hostedServices.push(desc.factory(serviceProvider));
      } else if (desc.implementationType) {
        if (desc.dependencies && desc.dependencies.length > 0) {
          const args = desc.dependencies.map((token) => serviceProvider.get(token));
          hostedServices.push(new desc.implementationType(...args));
        } else {
          hostedServices.push(new desc.implementationType());
        }
      }
    }

    // Resolve startup validators (e.g. validateOnStart() options)
    const startupValidatorDescriptors = this.services.findAll(STARTUP_VALIDATOR_TOKEN);
    const startupValidators: Array<() => void> = [];
    for (const desc of startupValidatorDescriptors) {
      if (desc.factory) {
        const validator = desc.factory(serviceProvider);
        if (validator && typeof (validator as any).validate === 'function') {
          startupValidators.push((validator as any).validate);
        }
      }
    }

    const logger = this.logging.createLogger('Host');
    const coordinator = new HostLifecycleCoordinator(lifetime, logger, this.options);

    return new AppHost(
      serviceProvider,
      this.config,
      hostedServices,
      coordinator,
      startupValidators,
    );
  }
}
