import {
  IServiceProvider,
  ServiceDescriptor,
  ServiceFactory,
  ServiceIdentifier,
} from './types.js';
import { ServiceProvider } from './service-provider.js';

export class ServiceCollection implements Iterable<ServiceDescriptor> {
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

  addSingleton<T>(token: ServiceIdentifier<T>, instance: T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, factory: ServiceFactory<T>): this;
  addSingleton<T>(token: ServiceIdentifier<T>, factoryOrInstance: T | ServiceFactory<T>): this {
    if (typeof factoryOrInstance === 'function' && !(factoryOrInstance instanceof Function && (factoryOrInstance as any).prototype && typeof (factoryOrInstance as any).prototype === 'object' && Object.getOwnPropertyNames((factoryOrInstance as any).prototype).length > 1 && !factoryOrInstance.length)) {
      // Check if it's a factory function
      return this.add({
        token,
        lifetime: 'singleton',
        factory: factoryOrInstance as ServiceFactory<T>,
      });
    }

    if (typeof factoryOrInstance === 'function' && factoryOrInstance.length === 1) {
      return this.add({
        token,
        lifetime: 'singleton',
        factory: factoryOrInstance as ServiceFactory<T>,
      });
    }

    // Treated as instance or factory
    if (typeof factoryOrInstance === 'function') {
      return this.add({
        token,
        lifetime: 'singleton',
        factory: factoryOrInstance as ServiceFactory<T>,
      });
    }

    return this.add({
      token,
      lifetime: 'singleton',
      instance: factoryOrInstance,
    });
  }

  addScoped<T>(token: ServiceIdentifier<T>, factory: ServiceFactory<T>): this {
    return this.add({
      token,
      lifetime: 'scoped',
      factory,
    });
  }

  addTransient<T>(token: ServiceIdentifier<T>, factory: ServiceFactory<T>): this {
    return this.add({
      token,
      lifetime: 'transient',
      factory,
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

  tryAddSingleton<T>(token: ServiceIdentifier<T>, factoryOrInstance: T | ServiceFactory<T>): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addSingleton(token, factoryOrInstance as any);
      return true;
    }
    return false;
  }

  tryAddScoped<T>(token: ServiceIdentifier<T>, factory: ServiceFactory<T>): boolean {
    const exists = this.descriptors.some((d) => d.token === token);
    if (!exists) {
      this.addScoped(token, factory);
      return true;
    }
    return false;
  }

  tryAddTransient<T>(token: ServiceIdentifier<T>, factory: ServiceFactory<T>): boolean {
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
