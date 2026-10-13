import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CaptiveDependencyError,
  CircularDependencyError,
  ObjectDisposedError,
  ServiceCollection,
  ServiceNotFoundError,
  ServiceToken,
} from '../di/index.js';
import { HOSTED_SERVICE_TOKEN } from '../hosted-services/types.js';

describe('@tsnx/hosting: Dependency Injection', () => {
  it('resolves singleton, transient, and scoped lifetimes correctly', async () => {
    const services = new ServiceCollection();

    let singletonCount = 0;
    let transientCount = 0;
    let scopedCount = 0;

    services.addSingleton('SingletonId', () => ++singletonCount);
    services.addTransient('TransientId', () => ++transientCount);
    services.addScoped('ScopedId', () => ++scopedCount);

    const rootProvider = services.buildServiceProvider();

    // 1. Singletons are shared
    assert.equal(rootProvider.get('SingletonId'), 1);
    assert.equal(rootProvider.get('SingletonId'), 1);

    // 2. Transients create a new instance each time
    assert.equal(rootProvider.get('TransientId'), 1);
    assert.equal(rootProvider.get('TransientId'), 2);

    // 3. Scoped requires an active scope
    const scope1 = rootProvider.createScope();
    assert.equal(scope1.serviceProvider.get('ScopedId'), 1);
    assert.equal(scope1.serviceProvider.get('ScopedId'), 1);
    assert.equal(scope1.serviceProvider.get('SingletonId'), 1); // scope shares singletons

    const scope2 = rootProvider.createScope();
    assert.equal(scope2.serviceProvider.get('ScopedId'), 2);
    assert.equal(scope2.serviceProvider.get('ScopedId'), 2);

    await scope1.dispose();
    await scope2.dispose();
  });

  it('rejects captive dependency: resolving scoped service from root or singleton throws CaptiveDependencyError', () => {
    const services = new ServiceCollection();

    class RequestContext {
      id = Math.random();
    }

    class UserService {
      constructor(public readonly context: RequestContext) {}
    }

    services.addScoped(RequestContext, () => new RequestContext());
    services.addSingleton(UserService, (sp) => new UserService(sp.get(RequestContext)));

    const rootProvider = services.buildServiceProvider();

    // 1. Direct resolution from root must be rejected
    assert.throws(
      () => rootProvider.get(RequestContext),
      (err: unknown) => {
        assert.ok(err instanceof CaptiveDependencyError);
        assert.ok(err.message.includes('RequestContext'));
        return true;
      },
    );

    // 2. Captive resolution through root singleton must be rejected
    assert.throws(
      () => rootProvider.get(UserService),
      (err: unknown) => {
        assert.ok(err instanceof CaptiveDependencyError);
        return true;
      },
    );

    // 3. Allowed inside an active scope
    const scope = rootProvider.createScope();
    const scopedContext = scope.serviceProvider.get(RequestContext);
    assert.ok(scopedContext);
  });

  it('detects circular dependencies and throws CircularDependencyError with chain', () => {
    const services = new ServiceCollection();

    services.addTransient('ServiceA', (sp) => sp.get('ServiceB'));
    services.addTransient('ServiceB', (sp) => sp.get('ServiceC'));
    services.addTransient('ServiceC', (sp) => sp.get('ServiceA'));

    const provider = services.buildServiceProvider();

    assert.throws(
      () => provider.get('ServiceA'),
      (err: unknown) => {
        assert.ok(err instanceof CircularDependencyError);
        assert.ok(err.message.includes('ServiceA -> ServiceB -> ServiceC -> ServiceA'));
        return true;
      },
    );
  });

  it('handles duplicate registrations and tryAdd correctly', () => {
    const services = new ServiceCollection();

    services.addSingleton('Config', 'Version 1');
    services.addSingleton('Config', 'Version 2'); // Overwrites last registered

    const added = services.tryAddSingleton('Config', 'Version 3');
    assert.equal(added, false); // Already exists

    const provider = services.buildServiceProvider();
    assert.equal(provider.get('Config'), 'Version 2');

    // Missing service
    assert.throws(
      () => provider.get('NonExistent'),
      (err: unknown) => err instanceof ServiceNotFoundError,
    );
  });

  it('disposes scoped and container instances in reverse creation order', async () => {
    const services = new ServiceCollection();
    const disposalLog: string[] = [];

    class ResourceA {
      dispose() {
        disposalLog.push('ResourceA');
      }
    }

    class ResourceB {
      async [Symbol.asyncDispose]() {
        disposalLog.push('ResourceB');
      }
    }

    services.addScoped(ResourceA, () => new ResourceA());
    services.addScoped(ResourceB, () => new ResourceB());

    const rootProvider = services.buildServiceProvider();
    const scope = rootProvider.createScope();

    // Create in order: A, then B
    scope.serviceProvider.get(ResourceA);
    scope.serviceProvider.get(ResourceB);

    await scope.dispose();

    // Must be disposed in reverse order: B first, then A
    assert.deepEqual(disposalLog, ['ResourceB', 'ResourceA']);

    // Attempting to resolve after disposal throws ObjectDisposedError
    assert.throws(
      () => scope.serviceProvider.get(ResourceA),
      (err: unknown) => err instanceof ObjectDisposedError,
    );
  });

  it('only disposes container-created instances and never disposes external pre-registered instances', async () => {
    const services = new ServiceCollection();
    let externalDisposed = false;
    let containerCreatedDisposed = false;

    class ExternalResource {
      dispose() {
        externalDisposed = true;
      }
    }

    class OwnedResource {
      dispose() {
        containerCreatedDisposed = true;
      }
    }

    const externalInstance = new ExternalResource();

    // 1. Pre-registered external instance
    services.addSingleton(ExternalResource, externalInstance);

    // 2. Container-created instance via factory
    services.addSingleton(OwnedResource, () => new OwnedResource());

    const rootProvider = services.buildServiceProvider() as any;

    rootProvider.get(ExternalResource);
    rootProvider.get(OwnedResource);

    await rootProvider.dispose();

    // Container-created instance must be disposed
    assert.equal(containerCreatedDisposed, true);

    // External pre-registered instance must NOT be disposed by the container
    assert.equal(externalDisposed, false);
  });

  it('F-001: preserves type inference with ServiceToken and addSingleton without manual sp annotation', () => {
    const services = new ServiceCollection();

    class CacheService {
      constructor(public readonly name: string) {}
    }
    const CACHE = Symbol('Cache') as ServiceToken<CacheService>;

    // sp is inferred as IServiceProvider without any manual type annotations
    services.addSingleton(CACHE, (sp) => {
      assert.ok(typeof sp.get === 'function');
      return new CacheService('in-memory');
    });

    const sp = services.buildServiceProvider();
    const cache = sp.get(CACHE);
    assert.ok(cache instanceof CacheService);
    assert.equal(cache.name, 'in-memory');
  });

  it('F-002: supports addHostedService for constructors and factories', () => {
    const services = new ServiceCollection();

    class MyWorker {
      started = false;
      stopped = false;
      async start(_signal: AbortSignal) {
        this.started = true;
      }
      async stop(_signal: AbortSignal) {
        this.stopped = true;
      }
    }

    services.addHostedService(MyWorker);
    services.addHostedService((sp) => {
      assert.ok(typeof sp.get === 'function');
      return new MyWorker();
    });

    const descriptors = services.findAll(HOSTED_SERVICE_TOKEN);
    assert.equal(descriptors.length, 2);
    assert.equal(descriptors[0].implementationType, MyWorker);
    assert.ok(typeof descriptors[1].factory === 'function');
  });
});
