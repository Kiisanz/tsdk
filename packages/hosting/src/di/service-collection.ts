import {
  IBindingBuilder,
  IHostedServiceBindingBuilder,
  IServiceCollection,
  IServiceProvider,
  IServiceProviderRoot,
  ServiceDescriptor,
  ServiceFactory,
  ServiceIdentifier,
  ServiceLifetime,
  ServiceProviderOptions,
  ServiceToken,
} from './types.js';
import { HostedService, HOSTED_SERVICE_TOKEN } from '../hosted-services/types.js';
import { ServiceProvider } from './service-provider.js';

class BindingBuilder<T> implements IBindingBuilder<T> {
  constructor(
    private readonly collection: ServiceCollection,
    private readonly token: ServiceIdentifier<T>,
    private readonly lifetime: ServiceLifetime,
  ) {}

  toClass<TArgs extends any[]>(
    ctor: new (...args: TArgs) => T,
    ...tokens: { [K in keyof TArgs]: ServiceToken<TArgs[K]> }
  ): IServiceCollection {
    this.collection.add({
      token: this.token,
      lifetime: this.lifetime,
      implementationType: ctor,
      dependencies: tokens,
    });
    return this.collection;
  }

  toFactory(factory: (sp: IServiceProvider) => T): IServiceCollection {
    this.collection.add({
      token: this.token,
      lifetime: this.lifetime,
      factory,
    });
    return this.collection;
  }

  toInstance(instance: T): IServiceCollection {
    this.collection.add({
      token: this.token,
      lifetime: this.lifetime,
      instance,
    });
    return this.collection;
  }
}

class HostedServiceBindingBuilder implements IHostedServiceBindingBuilder {
  constructor(private readonly collection: ServiceCollection) {}

  toClass<T extends HostedService, TArgs extends any[]>(
    ctor: new (...args: TArgs) => T,
    ...tokens: { [K in keyof TArgs]: ServiceToken<TArgs[K]> }
  ): IServiceCollection {
    this.collection.add({
      token: HOSTED_SERVICE_TOKEN,
      lifetime: 'singleton',
      implementationType: ctor,
      dependencies: tokens,
      factory: (sp) => {
        const args = tokens.map((t) => sp.get(t));
        return new ctor(...(args as any));
      },
    });
    return this.collection;
  }

  toFactory<T extends HostedService>(
    factory: (sp: IServiceProvider) => T,
  ): IServiceCollection {
    this.collection.add({
      token: HOSTED_SERVICE_TOKEN,
      lifetime: 'singleton',
      factory,
    });
    return this.collection;
  }
}

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

  addSingleton<T>(token: ServiceToken<T>): IBindingBuilder<T>;
  addSingleton<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceToken<T>, instance: T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, instance: T): this;
  addSingleton<T>(implementationType: new (...args: any[]) => T): this;
  addSingleton<T>(
    tokenOrType: ServiceIdentifier<T>,
    factoryOrInstance?: T | ServiceFactory<T>,
  ): IBindingBuilder<T> | this {
    if (factoryOrInstance === undefined) {
      if (typeof tokenOrType === 'function') {
        return this.add({
          token: tokenOrType,
          lifetime: 'singleton',
          implementationType: tokenOrType as new (...args: any[]) => T,
        });
      }
      return new BindingBuilder<T>(this, tokenOrType, 'singleton');
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

  addScoped<T>(token: ServiceToken<T>): IBindingBuilder<T>;
  addScoped<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(implementationType: new (...args: any[]) => T): this;
  addScoped<T>(
    tokenOrType: ServiceIdentifier<T>,
    factory?: ServiceFactory<T>,
  ): IBindingBuilder<T> | this {
    if (factory === undefined) {
      if (typeof tokenOrType === 'function') {
        return this.add({
          token: tokenOrType,
          lifetime: 'scoped',
          implementationType: tokenOrType as new (...args: any[]) => T,
        });
      }
      return new BindingBuilder<T>(this, tokenOrType, 'scoped');
    }

    return this.add({
      token: tokenOrType,
      lifetime: 'scoped',
      factory,
    });
  }

  addTransient<T>(token: ServiceToken<T>): IBindingBuilder<T>;
  addTransient<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(implementationType: new (...args: any[]) => T): this;
  addTransient<T>(
    tokenOrType: ServiceIdentifier<T>,
    factory?: ServiceFactory<T>,
  ): IBindingBuilder<T> | this {
    if (factory === undefined) {
      if (typeof tokenOrType === 'function') {
        return this.add({
          token: tokenOrType,
          lifetime: 'transient',
          implementationType: tokenOrType as new (...args: any[]) => T,
        });
      }
      return new BindingBuilder<T>(this, tokenOrType, 'transient');
    }

    return this.add({
      token: tokenOrType,
      lifetime: 'transient',
      factory,
    });
  }

  addHostedService(): IHostedServiceBindingBuilder;
  addHostedService<T extends HostedService>(factory: (sp: IServiceProvider) => T): this;
  addHostedService<T extends HostedService>(
    factory?: (sp: IServiceProvider) => T,
  ): IHostedServiceBindingBuilder | this {
    if (factory) {
      return this.add({
        token: HOSTED_SERVICE_TOKEN,
        lifetime: 'singleton',
        factory,
      });
    }
    return new HostedServiceBindingBuilder(this);
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

  buildServiceProvider(options?: ServiceProviderOptions): IServiceProviderRoot {
    return new ServiceProvider(this.descriptors, true, undefined, undefined, options);
  }
}
