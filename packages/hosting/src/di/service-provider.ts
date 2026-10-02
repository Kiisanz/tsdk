import {
  CaptiveDependencyError,
  CircularDependencyError,
  ObjectDisposedError,
  ServiceNotFoundError,
} from './errors.js';
import {
  IServiceProvider,
  IServiceProviderRoot,
  IServiceProviderScope,
  ServiceDescriptor,
  ServiceIdentifier,
  ServiceProviderOptions,
} from './types.js';

class ServiceResolverView implements IServiceProvider {
  constructor(private readonly provider: ServiceProvider) {}

  get<T = any>(token: ServiceIdentifier<T>): T {
    return this.provider.get(token);
  }

  getOptional<T = any>(token: ServiceIdentifier<T>): T | undefined {
    return this.provider.getOptional(token);
  }
}

export class ServiceProvider implements IServiceProviderRoot, IServiceProviderScope {
  private readonly descriptors = new Map<ServiceIdentifier, ServiceDescriptor>();
  private readonly singletonInstances: Map<ServiceIdentifier, any>;
  private readonly scopedInstances: Map<ServiceIdentifier, any>;
  private readonly ownedInstances: any[] = [];
  private readonly rootOwnedInstances?: any[];
  private readonly resolutionStack: ServiceIdentifier[] = [];
  private isDisposed = false;

  constructor(
    descriptorList: readonly ServiceDescriptor[],
    private readonly isRoot = true,
    singletonInstances?: Map<ServiceIdentifier, any>,
    rootOwnedInstances?: any[],
    private readonly options: ServiceProviderOptions = {},
  ) {
    // Index descriptors (last registered wins)
    for (const d of descriptorList) {
      this.descriptors.set(d.token, d);
    }

    this.singletonInstances = singletonInstances ?? new Map<ServiceIdentifier, any>();
    this.scopedInstances = new Map<ServiceIdentifier, any>();
    this.rootOwnedInstances = rootOwnedInstances;

    if (this.isRoot && this.options.validateOnBuild) {
      this.validateGraph();
    }
  }

  get serviceProvider(): IServiceProvider {
    return this;
  }

  get<T = any>(token: ServiceIdentifier<T>): T {
    const instance = this.getOptional<T>(token);
    if (instance === undefined) {
      const consumer = this.resolutionStack.length > 0
        ? this.resolutionStack[this.resolutionStack.length - 1]
        : undefined;
      throw new ServiceNotFoundError(token, consumer);
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
        if (this.isRoot) {
          this.ownedInstances.push(created);
        } else if (this.rootOwnedInstances) {
          this.rootOwnedInstances.push(created);
        }
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
        throw new Error(`Unsupported lifetime "${(descriptor as any).lifetime}"`);
    }
  }

  private createInstance<T>(descriptor: ServiceDescriptor<T>): T {
    this.resolutionStack.push(descriptor.token);
    try {
      if (descriptor.factory) {
        return descriptor.factory(new ServiceResolverView(this));
      }

      if (descriptor.implementationType) {
        if (descriptor.dependencies && descriptor.dependencies.length > 0) {
          const args: any[] = [];
          for (const depToken of descriptor.dependencies) {
            args.push(this.get(depToken));
          }
          return new descriptor.implementationType(...args);
        }
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

  private validateGraph(): void {
    const descriptorMap = this.descriptors;

    for (const d of descriptorMap.values()) {
      if (d.dependencies && d.dependencies.length > 0) {
        for (const depToken of d.dependencies) {
          const target = descriptorMap.get(depToken);
          // Missing registration
          if (!target) {
            throw new ServiceNotFoundError(depToken, d.token);
          }
          // Captive dependency
          if (d.lifetime === 'singleton' && target.lifetime === 'scoped') {
            throw new CaptiveDependencyError(depToken, d.token);
          }
        }
      }
    }

    // Circular dependency check on analyzable class graph
    const visited = new Set<ServiceIdentifier>();
    const recursionStack = new Set<ServiceIdentifier>();

    const checkCycle = (token: ServiceIdentifier, path: ServiceIdentifier[]) => {
      visited.add(token);
      recursionStack.add(token);

      const d = descriptorMap.get(token);
      if (d?.dependencies) {
        for (const depToken of d.dependencies) {
          if (!visited.has(depToken)) {
            checkCycle(depToken, [...path, depToken]);
          } else if (recursionStack.has(depToken)) {
            throw new CircularDependencyError([...path, depToken]);
          }
        }
      }

      recursionStack.delete(token);
    };

    for (const token of descriptorMap.keys()) {
      if (!visited.has(token)) {
        checkCycle(token, [token]);
      }
    }
  }

  createScope(): IServiceProviderScope {
    if (this.isDisposed) {
      throw new ObjectDisposedError('ServiceProvider');
    }

    return new ServiceProvider(
      Array.from(this.descriptors.values()),
      false, // isRoot = false
      this.singletonInstances,
      this.ownedInstances,
      this.options,
    );
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

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}
