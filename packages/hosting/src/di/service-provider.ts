import {
  CaptiveDependencyError,
  CircularDependencyError,
  ObjectDisposedError,
  ServiceNotFoundError,
} from './errors.js';
import {
  IServiceProvider,
  IServiceScope,
  ServiceDescriptor,
  ServiceIdentifier,
} from './types.js';

export class ServiceProvider implements IServiceProvider {
  private readonly descriptors = new Map<ServiceIdentifier, ServiceDescriptor>();
  private readonly singletonInstances: Map<ServiceIdentifier, any>;
  private readonly scopedInstances: Map<ServiceIdentifier, any>;
  private readonly ownedInstances: any[] = [];
  private readonly resolutionStack: ServiceIdentifier[] = [];
  private isDisposed = false;

  constructor(
    descriptorList: readonly ServiceDescriptor[],
    private readonly isRoot = true,
    singletonInstances?: Map<ServiceIdentifier, any>,
  ) {
    // Index descriptors (last registered wins)
    for (const d of descriptorList) {
      this.descriptors.set(d.token, d);
    }

    this.singletonInstances = singletonInstances ?? new Map<ServiceIdentifier, any>();
    this.scopedInstances = new Map<ServiceIdentifier, any>();
  }

  get<T = any>(token: ServiceIdentifier<T>): T {
    const instance = this.getOptional<T>(token);
    if (instance === undefined) {
      throw new ServiceNotFoundError(token);
    }
    return instance;
  }

  getOptional<T = any>(token: ServiceIdentifier<T>): T | undefined {
    if (this.isDisposed) {
      throw new ObjectDisposedError('ServiceProvider');
    }

    const descriptor = this.descriptors.get(token);
    if (!descriptor) {
      return undefined;
    }

    // 1. Captive Dependency Check: Scoped cannot be resolved from root provider
    if (descriptor.lifetime === 'scoped' && this.isRoot) {
      const consumer = this.resolutionStack.length > 0
        ? this.resolutionStack[this.resolutionStack.length - 1]
        : undefined;
      throw new CaptiveDependencyError(token, consumer);
    }

    // 2. Circular Dependency Check
    if (this.resolutionStack.includes(token)) {
      throw new CircularDependencyError([...this.resolutionStack, token]);
    }

    // 3. Lifetime Resolution
    switch (descriptor.lifetime) {
      case 'singleton': {
        if (descriptor.instance !== undefined) {
          return descriptor.instance;
        }

        if (this.singletonInstances.has(token)) {
          return this.singletonInstances.get(token);
        }

        const created = this.createInstance(descriptor);
        this.singletonInstances.set(token, created);
        this.ownedInstances.push(created);
        return created;
      }

      case 'scoped': {
        if (this.scopedInstances.has(token)) {
          return this.scopedInstances.get(token);
        }

        const created = this.createInstance(descriptor);
        this.scopedInstances.set(token, created);
        this.ownedInstances.push(created);
        return created;
      }

      case 'transient': {
        const created = this.createInstance(descriptor);
        this.ownedInstances.push(created);
        return created;
      }

      default:
        throw new Error(`Unsupported lifetime "${descriptor.lifetime}"`);
    }
  }

  private createInstance<T>(descriptor: ServiceDescriptor<T>): T {
    this.resolutionStack.push(descriptor.token);
    try {
      if (descriptor.factory) {
        return descriptor.factory(this);
      }

      if (descriptor.implementationType) {
        return new descriptor.implementationType();
      }

      if (typeof descriptor.token === 'function') {
        const ctor = descriptor.token as new (...args: any[]) => T;
        return new ctor();
      }

      throw new Error(`Cannot resolve service "${String(descriptor.token)}": no factory or instance provided.`);
    } finally {
      this.resolutionStack.pop();
    }
  }

  createScope(): IServiceScope {
    if (this.isDisposed) {
      throw new ObjectDisposedError('ServiceProvider');
    }

    const scopedProvider = new ServiceProvider(
      Array.from(this.descriptors.values()),
      false, // isRoot = false
      this.singletonInstances,
    );

    return new ServiceScope(scopedProvider);
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    // Dispose owned instances in reverse order of creation
    const instancesToDispose = [...this.ownedInstances].reverse();
    for (const inst of instancesToDispose) {
      if (!inst || typeof inst !== 'object') continue;

      if (typeof inst[Symbol.asyncDispose] === 'function') {
        await inst[Symbol.asyncDispose]();
      } else if (typeof inst[Symbol.dispose] === 'function') {
        inst[Symbol.dispose]();
      } else if (typeof inst.dispose === 'function') {
        const res = inst.dispose();
        if (res && typeof res.then === 'function') {
          await res;
        }
      }
    }
    this.ownedInstances.length = 0;
  }
}

class ServiceScope implements IServiceScope {
  private isDisposed = false;

  constructor(public readonly serviceProvider: ServiceProvider) {}

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    await this.serviceProvider.dispose();
  }
}
