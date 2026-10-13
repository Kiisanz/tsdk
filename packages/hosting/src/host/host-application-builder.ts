import { Configuration } from '../config/configuration.js';
import { CommandLineConfigurationProvider } from '../config/providers/command-line-provider.js';
import { EnvironmentVariablesConfigurationProvider } from '../config/providers/env-provider.js';
import { JsonConfigurationProvider } from '../config/providers/json-provider.js';
import { MemoryConfigurationProvider } from '../config/providers/memory-provider.js';
import { ServiceCollection } from '../di/service-collection.js';
import { ServiceFactory } from '../di/types.js';
import { HostedService, HOSTED_SERVICE_TOKEN } from '../hosted-services/types.js';
import { HostApplicationLifetime, HostLifecycleCoordinator } from '../lifecycle/host-lifetime.js';
import { LoggerFactory } from '../logging/console-logger.js';
import { LogLevel } from '../logging/types.js';
import { AppHost } from './app-host.js';
import { HostOptions, IHost } from './types.js';

export class HostApplicationBuilder {
  public readonly services = new ServiceCollection();
  public readonly config = new Configuration();
  public readonly logging = new LoggerFactory(LogLevel.Information);
  private readonly hostedServiceFactories: Array<(services: any) => HostedService> = [];
  public readonly options: HostOptions = {};

  constructor(args: string[] = []) {
    // 1. Setup Ordered Configuration Providers:
    // Defaults -> JSON -> Environment Variables -> CLI Arguments
    const env = process.env.NODE_ENV || 'development';

    this.config.addProvider(new MemoryConfigurationProvider({ environment: env }));
    this.config.addProvider(new JsonConfigurationProvider('appsettings.json', true));
    this.config.addProvider(new JsonConfigurationProvider(`appsettings.${env}.json`, true));
    this.config.addProvider(new EnvironmentVariablesConfigurationProvider());
    this.config.addProvider(new CommandLineConfigurationProvider(args));

    // 2. Pre-register core hosting services into DI
    this.services.addSingleton(Configuration, () => this.config);
    this.services.addSingleton(LoggerFactory, () => this.logging);
  }

  addHostedService<T extends HostedService>(
    serviceOrCtor: T | (new (...args: any[]) => T) | ServiceFactory<T>,
  ): this {
    if (typeof serviceOrCtor === 'function') {
      if (serviceOrCtor.length === 1) {
        // Factory function
        const factory = serviceOrCtor as ServiceFactory<T>;
        this.hostedServiceFactories.push((sp) => factory(sp));
      } else {
        // Class constructor
        const ctor = serviceOrCtor as new (...args: any[]) => T;
        this.hostedServiceFactories.push((sp) => new ctor(sp));
      }
    } else {
      // Instance
      this.hostedServiceFactories.push(() => serviceOrCtor);
    }
    return this;
  }

  build(): IHost {
    const lifetime = new HostApplicationLifetime();
    this.services.addSingleton(HostApplicationLifetime, () => lifetime);

    const serviceProvider = this.services.buildServiceProvider();

    // Resolve hosted services
    const hostedServices: HostedService[] = [];
    for (const factory of this.hostedServiceFactories) {
      hostedServices.push(factory(serviceProvider));
    }

    // Also collect any hosted services registered with HOSTED_SERVICE_TOKEN in the service collection
    const registeredHostedDescriptors = this.services.findAll(HOSTED_SERVICE_TOKEN);
    for (const desc of registeredHostedDescriptors) {
      if (desc.instance) {
        hostedServices.push(desc.instance);
      } else if (desc.factory) {
        hostedServices.push(desc.factory(serviceProvider));
      }
    }

    const logger = this.logging.createLogger('Host');
    const coordinator = new HostLifecycleCoordinator(lifetime, logger, this.options);

    return new AppHost(
      serviceProvider,
      this.config,
      hostedServices,
      coordinator,
    );
  }
}
