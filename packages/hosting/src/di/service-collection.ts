import {
  IBindingBuilder,
  IHostedServiceBindingBuilder,
  InjectionToken,
  IServiceCollection,
  IServiceProvider,
  IServiceProviderRoot,
  ServiceDescriptor,
  ServiceFactory,
  ServiceIdentifier,
  ServiceLifetime,
  ServiceProviderOptions,
} from './types.js';
import { HostedService, HOSTED_SERVICE_TOKEN } from '../hosted-services/types.js';
import { ServiceProvider } from './service-provider.js';

class BindingBuilder<T> implements IBindingBuilder<T> {
  constructor(
    private readonly collection: ServiceCollection,
    private readonly token: InjectionToken<T>,
    private readonly lifetime: ServiceLifetime,
    private descriptor?: ServiceDescriptor<T>,
  ) {}

  toClass(): IServiceCollection;
  toClass<TArgs extends any[]>(
    ctor: new (...args: TArgs) => T,
    ...tokens: { [K in keyof TArgs]: InjectionToken<TArgs[K]> }
  ): IServiceCollection;
  toClass<TArgs extends any[]>(
    ctor?: new (...args: TArgs) => T,
    ...tokens: { [K in keyof TArgs]: InjectionToken<TArgs[K]> }
  ): IServiceCollection {
    const implType = ctor ?? (typeof this.token === 'function' ? (this.token as any) : undefined);
    if (!implType) {
      throw new Error(`Cannot register toClass without an implementation class for token "${String(this.token)}".`);
    }

    if (this.descriptor) {
      this.descriptor.implementationType = implType;
      this.descriptor.dependencies = tokens.length > 0 ? (tokens as any) : undefined;
      delete this.descriptor.factory;
      delete this.descriptor.instance;
    } else {
      this.descriptor = {
        token: this.token,
        lifetime: this.lifetime,
        implementationType: implType,
        dependencies: tokens.length > 0 ? (tokens as any) : undefined,
      };
      this.collection.add(this.descriptor);
    }
    return this.collection;
  }

  toFactory(factory: (sp: IServiceProvider) => T): IServiceCollection {
    if (this.descriptor) {
      this.descriptor.factory = factory;
      delete this.descriptor.implementationType;
      delete this.descriptor.dependencies;
      delete this.descriptor.instance;
    } else {
      this.descriptor = {
        token: this.token,
        lifetime: this.lifetime,
        factory,
      };
      this.collection.add(this.descriptor);
    }
    return this.collection;
  }

  toInstance(instance: T): IServiceCollection {
    if (this.descriptor) {
      this.descriptor.instance = instance;
      delete this.descriptor.implementationType;
      delete this.descriptor.dependencies;
      delete this.descriptor.factory;
    } else {
      this.descriptor = {
        token: this.token,
        lifetime: this.lifetime,
        instance,
      };
      this.collection.add(this.descriptor);
    }
    return this.collection;
  }
}

class HostedServiceBindingBuilder implements IHostedServiceBindingBuilder {
  constructor(private readonly collection: ServiceCollection) {}

  toClass<T extends HostedService, TArgs extends any[]>(
    ctor: new (...args: TArgs) => T,
    ...tokens: { [K in keyof TArgs]: InjectionToken<TArgs[K]> }
  ): IServiceCollection {
    this.collection.add({
      token: HOSTED_SERVICE_TOKEN,
      lifetime: 'singleton',
      implementationType: ctor,
      dependencies: tokens as any,
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

  addSingleton<T>(token: InjectionToken<T>): IBindingBuilder<T>;
  addSingleton<T>(token: InjectionToken<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: InjectionToken<T>, instance: T): this;
  addSingleton<T>(token: string, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: string, instance: T): this;
  addSingleton<T>(
    tokenOrType: InjectionToken<T> | string,
    factoryOrInstance?: T | ServiceFactory<T>,
  ): IBindingBuilder<T> | this {
    if (factoryOrInstance === undefined) {
      if (typeof tokenOrType === 'function') {
        const descriptor: ServiceDescriptor<T> = {
          token: tokenOrType,
          lifetime: 'singleton',
          implementationType: tokenOrType as new (...args: any[]) => T,
        };
        this.add(descriptor);
        return new BindingBuilder<T>(this, tokenOrType, 'singleton', descriptor);
      }
      return new BindingBuilder<T>(this, tokenOrType as InjectionToken<T>, 'singleton');
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

  addScoped<T>(token: InjectionToken<T>): IBindingBuilder<T>;
  addScoped<T>(token: InjectionToken<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(token: string, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(
    tokenOrType: InjectionToken<T> | string,
    factory?: ServiceFactory<T>,
  ): IBindingBuilder<T> | this {
    if (factory === undefined) {
      if (typeof tokenOrType === 'function') {
        const descriptor: ServiceDescriptor<T> = {
          token: tokenOrType,
          lifetime: 'scoped',
          implementationType: tokenOrType as new (...args: any[]) => T,
        };
        this.add(descriptor);
        return new BindingBuilder<T>(this, tokenOrType, 'scoped', descriptor);
      }
      return new BindingBuilder<T>(this, tokenOrType as InjectionToken<T>, 'scoped');
    }

    return this.add({
      token: tokenOrType,
      lifetime: 'scoped',
      factory,
    });
  }

  addTransient<T>(token: InjectionToken<T>): IBindingBuilder<T>;
  addTransient<T>(token: InjectionToken<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(token: string, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(
    tokenOrType: InjectionToken<T> | string,
    factory?: ServiceFactory<T>,
  ): IBindingBuilder<T> | this {
    if (factory === undefined) {
      if (typeof tokenOrType === 'function') {
        const descriptor: ServiceDescriptor<T> = {
          token: tokenOrType,
          lifetime: 'transient',
          implementationType: tokenOrType as new (...args: any[]) => T,
        };
        this.add(descriptor);
        return new BindingBuilder<T>(this, tokenOrType, 'transient', descriptor);
      }
      return new BindingBuilder<T>(this, tokenOrType as InjectionToken<T>, 'transient');
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

  tryAddSingleton<T>(token: InjectionToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddSingleton<T>(token: InjectionToken<T>, instance: T): boolean;
  tryAddSingleton<T>(token: string, factory: (provider: IServiceProvider) => T): boolean;
  tryAddSingleton<T>(token: string, instance: T): boolean;
  tryAddSingleton<T>(token: InjectionToken<T> | string, factoryOrInstance: T | ServiceFactory<T>): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addSingleton(token as any, factoryOrInstance as any);
      return true;
    }
    return false;
  }

  tryAddScoped<T>(token: InjectionToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddScoped<T>(token: string, factory: (provider: IServiceProvider) => T): boolean;
  tryAddScoped<T>(token: InjectionToken<T> | string, factory: (provider: IServiceProvider) => T): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addScoped(token as any, factory);
      return true;
    }
    return false;
  }

  tryAddTransient<T>(token: InjectionToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddTransient<T>(token: string, factory: (provider: IServiceProvider) => T): boolean;
  tryAddTransient<T>(token: InjectionToken<T> | string, factory: (provider: IServiceProvider) => T): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addTransient(token as any, factory);
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
