import {
  IServiceCollection,
  IServiceProvider,
  ServiceDescriptor,
  ServiceFactory,
  ServiceIdentifier,
  ServiceToken,
} from './types.js';
import { HostedService, HOSTED_SERVICE_TOKEN } from '../hosted-services/types.js';
import { ServiceProvider } from './service-provider.js';

export class ServiceCollection implements IServiceCollection {
  private readonly descriptors: ServiceDescriptor[] = [];

  [Symbol.iterator](): Iterator<ServiceDescriptor> {
    return this.descriptors[Symbol.iterator]();
  }

  get length(): number {
    return this.descriptors.length;
  }

  add<T>(descriptor: ServiceDescriptor<T>): this {
    this.descriptors.push(descriptor);
    return this;
  }

  addSingleton<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceToken<T>, instance: T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, instance: T): this;
  addSingleton<T>(implementationType: new (...args: any[]) => T): this;
  addSingleton<T>(tokenOrType: ServiceIdentifier<T>, factoryOrInstance?: T | ServiceFactory<T>): this {
    if (factoryOrInstance === undefined && typeof tokenOrType === 'function') {
      return this.add({
        token: tokenOrType,
        lifetime: 'singleton',
        implementationType: tokenOrType as new (...args: any[]) => T,
      });
    }

    if (typeof factoryOrInstance === 'function') {
      return this.add({
        token: tokenOrType,
        lifetime: 'singleton',
        factory: factoryOrInstance as ServiceFactory<T>,
      });
    }

    return this.add({
      token: tokenOrType,
      lifetime: 'singleton',
      instance: factoryOrInstance,
    });
  }

  addScoped<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(implementationType: new (...args: any[]) => T): this;
  addScoped<T>(tokenOrType: ServiceIdentifier<T>, factory?: ServiceFactory<T>): this {
    if (factory === undefined && typeof tokenOrType === 'function') {
      return this.add({
        token: tokenOrType,
        lifetime: 'scoped',
        implementationType: tokenOrType as new (...args: any[]) => T,
      });
    }

    return this.add({
      token: tokenOrType,
      lifetime: 'scoped',
      factory: factory!,
    });
  }

  addTransient<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(implementationType: new (...args: any[]) => T): this;
  addTransient<T>(tokenOrType: ServiceIdentifier<T>, factory?: ServiceFactory<T>): this {
    if (factory === undefined && typeof tokenOrType === 'function') {
      return this.add({
        token: tokenOrType,
        lifetime: 'transient',
        implementationType: tokenOrType as new (...args: any[]) => T,
      });
    }

    return this.add({
      token: tokenOrType,
      lifetime: 'transient',
      factory: factory!,
    });
  }

  addHostedService<T extends HostedService>(factory: (provider: IServiceProvider) => T): this;
  addHostedService<T extends HostedService>(implementationType: new (...args: any[]) => T): this;
  addHostedService<T extends HostedService>(
    implementationOrFactory: (new (...args: any[]) => T) | ((sp: IServiceProvider) => T),
  ): this {
    if (
      typeof implementationOrFactory === 'function' &&
      implementationOrFactory.prototype &&
      Object.getOwnPropertyNames(implementationOrFactory.prototype).length > 1
    ) {
      return this.add({
        token: HOSTED_SERVICE_TOKEN,
        lifetime: 'singleton',
        implementationType: implementationOrFactory as new (...args: any[]) => T,
      });
    }

    return this.add({
      token: HOSTED_SERVICE_TOKEN,
      lifetime: 'singleton',
      factory: implementationOrFactory as (sp: IServiceProvider) => T,
    });
  }

  tryAdd<T>(descriptor: ServiceDescriptor<T>): boolean {
    const exists = this.descriptors.some((d) => d.token === descriptor.token);
    if (!exists) {
      this.add(descriptor);
      return true;
    }
    return false;
  }

  tryAddSingleton<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddSingleton<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddSingleton<T>(token: ServiceToken<T>, instance: T): boolean;
  tryAddSingleton<T>(token: ServiceIdentifier<T>, instance: T): boolean;
  tryAddSingleton<T>(token: ServiceIdentifier<T>, factoryOrInstance: T | ServiceFactory<T>): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addSingleton(token, factoryOrInstance as any);
      return true;
    }
    return false;
  }

  tryAddScoped<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddScoped<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddScoped<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addScoped(token, factory);
      return true;
    }
    return false;
  }

  tryAddTransient<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddTransient<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddTransient<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addTransient(token, factory);
      return true;
    }
    return false;
  }

  find(token: ServiceIdentifier): ServiceDescriptor | undefined {
    // Return last registered descriptor for this token (overriding earlier ones)
    for (let i = this.descriptors.length - 1; i >= 0; i--) {
      if (this.descriptors[i].token === token) {
        return this.descriptors[i];
      }
    }
    return undefined;
  }

  findAll(token: ServiceIdentifier): ServiceDescriptor[] {
    return this.descriptors.filter((d) => d.token === token);
  }

  buildServiceProvider(): IServiceProvider {
    return new ServiceProvider(this.descriptors);
  }
}
