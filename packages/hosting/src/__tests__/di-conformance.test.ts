import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createToken,
  ServiceCollection,
  CaptiveDependencyError,
  CircularDependencyError,
  ServiceNotFoundError,
  BackgroundService,
  AppHost,
} from '../index.js';

describe('TSNX v0.2 DI Architecture: Conformance Test Suite', () => {
  // =========================================================================
  // Area 1: Typed Tokens
  // =========================================================================
  describe('Area 1: Typed Tokens', () => {
    it('creates branded unique symbols with distinct identity', () => {
      const TOKEN_A = createToken<string>('ServiceA');
      const TOKEN_B = createToken<string>('ServiceA'); // Same description

      assert.equal(typeof TOKEN_A, 'symbol');
      assert.equal(typeof TOKEN_B, 'symbol');
      assert.notEqual(TOKEN_A, TOKEN_B); // Identity is unique

      const services = new ServiceCollection();
      services.addSingleton(TOKEN_A).toInstance('Instance A');
      services.addSingleton(TOKEN_B).toInstance('Instance B');

      const sp = services.buildServiceProvider();
      assert.equal(sp.get(TOKEN_A), 'Instance A');
      assert.equal(sp.get(TOKEN_B), 'Instance B');
    });

    it('enforces compile-time type invariance between different token types', () => {
      interface User { readonly userId: string; }
      interface Order { readonly orderId: string; }

      const USER_TOKEN = createToken<User>('User');
      const ORDER_TOKEN = createToken<Order>('Order');

      // Static type assertion: ServiceToken<User> and ServiceToken<Order> are structurally distinct
      type IsAssignable<T, U> = [T] extends [U] ? true : false;
      type Check = IsAssignable<typeof USER_TOKEN, typeof ORDER_TOKEN>;
      const isAssignable: Check = false;
      assert.equal(isAssignable, false);
    });

    it('F-011: rejects raw Symbol() at compile-time and requires branded ServiceToken<T>', () => {
      interface User { readonly userId: string; }
      const USER_TOKEN = createToken<User>('User');

      type IsAssignable<T, U> = [T] extends [U] ? true : false;

      // Raw symbol must NOT be assignable to ServiceToken<User>
      type RawSymbolAssignable = IsAssignable<symbol, typeof USER_TOKEN>;
      const rawSymbolAssignable: RawSymbolAssignable = false;
      assert.equal(rawSymbolAssignable, false);

      // ServiceToken<User> must still be a symbol
      type TokenIsSymbol = IsAssignable<typeof USER_TOKEN, symbol>;
      const tokenIsSymbol: TokenIsSymbol = true;
      assert.equal(tokenIsSymbol, true);
    });
  });

  // =========================================================================
  // Area 2: Fluent Registration API
  // =========================================================================
  describe('Area 2: Fluent Registration API', () => {
    it('supports fluent toClass, toFactory, and toInstance with terminal completion', () => {
      interface ILogger { log(msg: string): void; }
      interface IRepo { get(id: string): string; }

      const LOGGER = createToken<ILogger>('Logger');
      const REPO = createToken<IRepo>('Repo');
      const SERVICE = createToken<{ run(): string }>('Service');

      class ConsoleLogger implements ILogger {
        log(msg: string) { void msg; }
      }
      class TaskRepo implements IRepo {
        get(id: string) { return `task-${id}`; }
      }
      class TaskService {
        constructor(public repo: IRepo, public logger: ILogger) {}
        run() { return this.repo.get('123'); }
      }

      const services = new ServiceCollection();

      // Class registration with dependencies
      const ret1 = services.addSingleton(LOGGER).toClass(ConsoleLogger);
      assert.equal(ret1, services); // Returns collection

      const ret2 = services.addScoped(REPO).toClass(TaskRepo);
      assert.equal(ret2, services);

      const ret3 = services.addScoped(SERVICE).toClass(TaskService, REPO, LOGGER);
      assert.equal(ret3, services);

      // Factory registration
      const CONFIG = createToken<{ port: number }>('Config');
      services.addSingleton(CONFIG).toFactory(() => ({ port: 8080 }));

      // Instance registration
      const VERSION = createToken<string>('Version');
      services.addSingleton(VERSION).toInstance('1.0.0');

      const root = services.buildServiceProvider();
      const scope = root.createScope();

      const svc = scope.get(SERVICE);
      assert.ok(svc instanceof TaskService);
      assert.equal(svc.run(), 'task-123');
      assert.equal(root.get(CONFIG).port, 8080);
      assert.equal(root.get(VERSION), '1.0.0');
    });

    it('F-010: supports class constructor tokens in fluent .toClass() with class and token dependencies', () => {
      interface ILogger { log(msg: string): void; }
      const LOGGER = createToken<ILogger>('Logger');

      class ConsoleLogger implements ILogger {
        log(msg: string) { void msg; }
      }
      class TaskRepo {
        get(id: string) { return `repo-${id}`; }
      }
      class TaskService {
        constructor(public repo: TaskRepo, public logger: ILogger) {}
        run() { return this.repo.get('456'); }
      }
      class StandaloneWorker {
        readonly ready = true;
      }

      const services = new ServiceCollection();

      // Register Logger with ServiceToken
      services.addSingleton(LOGGER).toClass(ConsoleLogger);

      // F-010: Register TaskRepo using class constructor token and zero-arg .toClass()
      services.addScoped(TaskRepo).toClass();

      // F-010: Register TaskService using class constructor token, taking class (TaskRepo) and token (LOGGER) dependencies
      const builder = services.addScoped(TaskService);
      // Verify builder has .toClass available
      const ret = builder.toClass(TaskService, TaskRepo, LOGGER);
      assert.equal(ret, services);

      // F-010: Standalone class registration without .toClass() remains valid
      services.addSingleton(StandaloneWorker);

      const root = services.buildServiceProvider();
      const scope = root.createScope();

      // Verify class-based token resolution works with exact type inference
      const svc = scope.get(TaskService);
      assert.ok(svc instanceof TaskService);
      assert.ok(svc.repo instanceof TaskRepo);
      assert.equal(svc.run(), 'repo-456');

      const worker = root.get(StandaloneWorker);
      assert.ok(worker instanceof StandaloneWorker);
      assert.equal(worker.ready, true);
    });
  });

  // =========================================================================
  // Area 3: Constructor Dependency Injection
  // =========================================================================
  describe('Area 3: Constructor Dependency Injection', () => {
    it('injects dependencies across various arities in exact parameter order', () => {
      const D0 = createToken<Dep0>('Dep0');
      const D1 = createToken<Dep1>('Dep1');
      const D2 = createToken<Dep2>('Dep2');
      const D3 = createToken<Dep3>('Dep3');

      class Dep0 { readonly tag = '0'; }
      class Dep1 { constructor(public d0: Dep0) {} }
      class Dep2 { constructor(public d0: Dep0, public d1: Dep1) {} }
      class Dep3 { constructor(public d0: Dep0, public d1: Dep1, public d2: Dep2) {} }

      const services = new ServiceCollection();
      services.addTransient(D0).toClass(Dep0);
      services.addTransient(D1).toClass(Dep1, D0);
      services.addTransient(D2).toClass(Dep2, D0, D1);
      services.addTransient(D3).toClass(Dep3, D0, D1, D2);

      const sp = services.buildServiceProvider();
      const d3 = sp.get(D3);

      assert.ok(d3 instanceof Dep3);
      assert.ok(d3.d0 instanceof Dep0);
      assert.ok(d3.d1 instanceof Dep1);
      assert.ok(d3.d2 instanceof Dep2);
      assert.equal(d3.d2.d0.tag, '0');
    });

    it('throws descriptive ServiceNotFoundError when a constructor dependency is missing', () => {
      const DEP = createToken<DepMissing>('DepMissing');
      const ROOT_SVC = createToken<RootSvc>('RootSvc');

      class DepMissing {}
      class RootSvc {
        constructor(public dep: DepMissing) {}
      }

      const services = new ServiceCollection();
      // Register RootSvc requiring DEP, but don't register DEP
      services.addTransient(ROOT_SVC).toClass(RootSvc, DEP);

      const sp = services.buildServiceProvider();
      assert.throws(
        () => sp.get(ROOT_SVC),
        (err: unknown) => {
          assert.ok(err instanceof ServiceNotFoundError);
          assert.ok(err.message.includes('DepMissing'));
          return true;
        },
      );
    });
  });

  // =========================================================================
  // Area 4: Hosted Services
  // =========================================================================
  describe('Area 4: Hosted Services', () => {
    it('supports fluent toClass and toFactory for hosted services with full DI', async () => {
      const COUNTER = createToken<Counter>('Counter');
      class Counter {
        count = 0;
        increment() { this.count++; }
      }

      let classWorkerRan = false;
      let factoryWorkerRan = false;

      class ClassWorker extends BackgroundService {
        constructor(private counter: Counter) {
          super();
        }
        async execute(stoppingToken: AbortSignal): Promise<void> {
          this.counter.increment();
          classWorkerRan = true;
          while (!stoppingToken.aborted) {
            await new Promise((r) => setTimeout(r, 10));
          }
        }
      }

      class FactoryWorker extends BackgroundService {
        constructor(private counter: Counter) {
          super();
        }
        async execute(stoppingToken: AbortSignal): Promise<void> {
          this.counter.increment();
          factoryWorkerRan = true;
          while (!stoppingToken.aborted) {
            await new Promise((r) => setTimeout(r, 10));
          }
        }
      }

      const builder = AppHost.createBuilder();
      builder.options.registerSignalHandlers = false;

      builder.services.addSingleton(COUNTER).toClass(Counter);

      // Fluent toClass
      builder.services.addHostedService().toClass(ClassWorker, COUNTER);

      // Fluent toFactory
      builder.services.addHostedService().toFactory((sp) => new FactoryWorker(sp.get(COUNTER)));

      const app = builder.build();
      try {
        await app.start();
        await new Promise((r) => setTimeout(r, 25));

        assert.equal(classWorkerRan, true);
        assert.equal(factoryWorkerRan, true);
        assert.equal(app.services.get(COUNTER).count, 2);
      } finally {
        await app.stop();
      }
    });

    it('F-010: supports class constructor dependencies in addHostedService().toClass()', async () => {
      class WorkerState {
        executed = false;
      }

      class StateWorker extends BackgroundService {
        constructor(public state: WorkerState) {
          super();
        }
        async execute(stoppingToken: AbortSignal): Promise<void> {
          this.state.executed = true;
          while (!stoppingToken.aborted) {
            await new Promise((r) => setTimeout(r, 10));
          }
        }
      }

      const builder = AppHost.createBuilder();
      builder.options.registerSignalHandlers = false;

      // Register WorkerState with class token
      builder.services.addSingleton(WorkerState);

      // Register hosted service using class token dependency
      builder.services.addHostedService().toClass(StateWorker, WorkerState);

      const app = builder.build();
      try {
        await app.start();
        await new Promise((r) => setTimeout(r, 25));
        assert.equal(app.services.get(WorkerState).executed, true);
      } finally {
        await app.stop();
      }
    });
  });

  // =========================================================================
  // Area 5: Scope & Lifetime Contracts
  // =========================================================================
  describe('Area 5: Scope & Lifetime Contracts', () => {
    it('isolates IServiceProvider passed into factories to resolution-only (no dispose/createScope)', () => {
      const SVC = createToken<string>('Svc');
      const services = new ServiceCollection();

      services.addSingleton(SVC).toFactory((sp) => {
        // sp only has get / getOptional
        assert.equal(typeof (sp as any).createScope, 'undefined');
        assert.equal(typeof (sp as any).dispose, 'undefined');
        return 'resolved-value';
      });

      const root = services.buildServiceProvider();
      assert.equal(root.get(SVC), 'resolved-value');
    });

    it('enforces lifetime semantics: singleton (shared), scoped (per-scope), transient (fresh)', () => {
      const SINGLETON = createToken<{ id: number }>('Singleton');
      const SCOPED = createToken<{ id: number }>('Scoped');
      const TRANSIENT = createToken<{ id: number }>('Transient');

      let nextId = 1;
      const services = new ServiceCollection();
      services.addSingleton(SINGLETON).toFactory(() => ({ id: nextId++ }));
      services.addScoped(SCOPED).toFactory(() => ({ id: nextId++ }));
      services.addTransient(TRANSIENT).toFactory(() => ({ id: nextId++ }));

      const root = services.buildServiceProvider();
      const scope1 = root.createScope();
      const scope2 = root.createScope();

      // Singleton is identical across scopes
      const s1 = scope1.get(SINGLETON);
      const s2 = scope2.get(SINGLETON);
      assert.equal(s1, s2);

      // Scoped is identical within same scope, distinct between scopes
      const sc1_a = scope1.get(SCOPED);
      const sc1_b = scope1.get(SCOPED);
      const sc2_a = scope2.get(SCOPED);
      assert.equal(sc1_a, sc1_b);
      assert.notEqual(sc1_a, sc2_a);

      // Transient is fresh on every call
      const t1 = scope1.get(TRANSIENT);
      const t2 = scope1.get(TRANSIENT);
      assert.notEqual(t1, t2);
    });
  });

  // =========================================================================
  // Area 6: Disposal Ownership & Reverse Order
  // =========================================================================
  describe('Area 6: Disposal Ownership & Reverse Order', () => {
    it('disposes owned instances in reverse order of creation and respects ownership boundary', async () => {
      const disposeLog: string[] = [];

      const DEP = createToken<DepService>('Dep');
      const CONSUMER = createToken<ConsumerService>('Consumer');

      class DepService {
        async dispose() {
          disposeLog.push('DepService.dispose');
        }
      }

      class ConsumerService {
        constructor(public dep: DepService) {}
        async dispose() {
          disposeLog.push('ConsumerService.dispose');
        }
      }

      const services = new ServiceCollection();
      services.addScoped(DEP).toClass(DepService);
      services.addScoped(CONSUMER).toClass(ConsumerService, DEP);

      const root = services.buildServiceProvider();
      const scope = root.createScope();

      // Resolving CONSUMER triggers DEP resolution first, then CONSUMER instantiation
      scope.get(CONSUMER);

      await scope.dispose();

      // Reverse order: ConsumerService must be disposed before DepService
      assert.deepEqual(disposeLog, ['ConsumerService.dispose', 'DepService.dispose']);
    });

    it('ensures scope disposal does not dispose singleton instances owned by root', async () => {
      const disposeLog: string[] = [];

      const SINGLETON = createToken<AppDatabase>('Db');
      const SCOPED = createToken<UserContext>('User');

      class AppDatabase {
        async dispose() { disposeLog.push('AppDatabase.dispose'); }
      }
      class UserContext {
        constructor(public db: AppDatabase) {}
        async dispose() { disposeLog.push('UserContext.dispose'); }
      }

      const services = new ServiceCollection();
      services.addSingleton(SINGLETON).toClass(AppDatabase);
      services.addScoped(SCOPED).toClass(UserContext, SINGLETON);

      const root = services.buildServiceProvider();
      const scope = root.createScope();

      scope.get(SCOPED);

      // Disposing scope must only dispose UserContext
      await scope.dispose();
      assert.deepEqual(disposeLog, ['UserContext.dispose']);

      // Disposing root finally disposes AppDatabase
      await root.dispose();
      assert.deepEqual(disposeLog, ['UserContext.dispose', 'AppDatabase.dispose']);
    });

    it('regression: cleans up dependencies created before constructor error', async () => {
      const disposeLog: string[] = [];

      const DEP = createToken<TransientDep>('Dep');
      const FAILING = createToken<FailingSvc>('Failing');

      class TransientDep {
        async dispose() { disposeLog.push('TransientDep.dispose'); }
      }
      class FailingSvc {
        constructor(public dep: TransientDep) {
          throw new Error('Constructor exploded!');
        }
      }

      const services = new ServiceCollection();
      services.addScoped(DEP).toClass(TransientDep);
      services.addScoped(FAILING).toClass(FailingSvc, DEP);

      const root = services.buildServiceProvider();
      const scope = root.createScope();

      assert.throws(
        () => scope.get(FAILING),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message, 'Constructor exploded!');
          return true;
        },
      );

      // Disposing scope must clean up the TransientDep that was created before constructor failed
      await scope.dispose();
      assert.deepEqual(disposeLog, ['TransientDep.dispose']);
    });

    it('guarantees disposal idempotency', async () => {
      let disposeCount = 0;
      const SVC = createToken<{ dispose(): void }>('Svc');

      const services = new ServiceCollection();
      services.addScoped(SVC).toFactory(() => ({
        dispose() { disposeCount++; },
      }));

      const root = services.buildServiceProvider();
      const scope = root.createScope();
      scope.get(SVC);

      await scope.dispose();
      await scope.dispose();
      assert.equal(disposeCount, 1);
    });
  });

  // =========================================================================
  // Area 7: Validation
  // =========================================================================
  describe('Area 7: Validation', () => {
    it('validateOnBuild detects missing dependencies in analyzable class graph', () => {
      const DEP = createToken<any>('MissingDep');
      const SVC = createToken<any>('Consumer');

      class Consumer { constructor(_dep: any) {} }

      const services = new ServiceCollection();
      services.addSingleton(SVC).toClass(Consumer, DEP);

      assert.throws(
        () => services.buildServiceProvider({ validateOnBuild: true }),
        (err: unknown) => {
          assert.ok(err instanceof ServiceNotFoundError);
          assert.ok(err.message.includes('MissingDep'));
          return true;
        },
      );
    });

    it('validateOnBuild detects circular dependencies in analyzable class graph', () => {
      const TOKEN_A = createToken<ServiceA>('ServiceA');
      const TOKEN_B = createToken<ServiceB>('ServiceB');

      class ServiceA { constructor(public b: ServiceB) {} }
      class ServiceB { constructor(public a: ServiceA) {} }

      const services = new ServiceCollection();
      services.addTransient(TOKEN_A).toClass(ServiceA, TOKEN_B);
      services.addTransient(TOKEN_B).toClass(ServiceB, TOKEN_A);

      assert.throws(
        () => services.buildServiceProvider({ validateOnBuild: true }),
        (err: unknown) => {
          assert.ok(err instanceof CircularDependencyError);
          assert.ok(err.message.includes('ServiceA'));
          assert.ok(err.message.includes('ServiceB'));
          return true;
        },
      );
    });

    it('validateOnBuild detects captive dependencies (singleton depending on scoped)', () => {
      const SCOPED_DEP = createToken<ScopedDep>('ScopedDep');
      const SINGLETON_SVC = createToken<SingletonSvc>('SingletonSvc');

      class ScopedDep {}
      class SingletonSvc { constructor(public dep: ScopedDep) {} }

      const services = new ServiceCollection();
      services.addScoped(SCOPED_DEP).toClass(ScopedDep);
      services.addSingleton(SINGLETON_SVC).toClass(SingletonSvc, SCOPED_DEP);

      assert.throws(
        () => services.buildServiceProvider({ validateOnBuild: true }),
        (err: unknown) => {
          assert.ok(err instanceof CaptiveDependencyError);
          assert.ok(err.message.includes('ScopedDep'));
          return true;
        },
      );
    });

    it('validateScopes prevents resolving scoped services directly from root at runtime', () => {
      const SCOPED = createToken<ScopedService>('ScopedService');
      class ScopedService {}

      const services = new ServiceCollection();
      services.addScoped(SCOPED).toClass(ScopedService);

      const root = services.buildServiceProvider({ validateScopes: true });

      assert.throws(
        () => root.get(SCOPED),
        (err: unknown) => {
          assert.ok(err instanceof CaptiveDependencyError);
          return true;
        },
      );

      // But resolving from scope succeeds
      const scope = root.createScope();
      assert.ok(scope.get(SCOPED) instanceof ScopedService);
    });

    it('supports multiple registrations with last-wins get() and findAll()', () => {
      const PLUGIN = createToken<{ name: string }>('Plugin');

      const services = new ServiceCollection();
      services.addSingleton(PLUGIN).toInstance({ name: 'PluginA' });
      services.addSingleton(PLUGIN).toInstance({ name: 'PluginB' });

      const all = services.findAll(PLUGIN);
      assert.equal(all.length, 2);

      const sp = services.buildServiceProvider();
      // Last-wins
      assert.equal(sp.get(PLUGIN).name, 'PluginB');
    });
  });

  // =========================================================================
  // Area 8: Primitive Constructor Parameters
  // =========================================================================
  describe('Area 8: Primitive Constructor Parameters', () => {
    it('injects primitive constructor arguments when matching ServiceToken is provided', () => {
      const PORT = createToken<number>('HttpPort');
      const HOST = createToken<string>('HttpHost');
      const SERVER = createToken<WebServer>('WebServer');

      class WebServer {
        constructor(public port: number, public host: string) {}
      }

      const services = new ServiceCollection();
      services.addSingleton(PORT).toInstance(3000);
      services.addSingleton(HOST).toInstance('127.0.0.1');
      services.addTransient(SERVER).toClass(WebServer, PORT, HOST);

      const sp = services.buildServiceProvider();
      const server = sp.get(SERVER);

      assert.equal(server.port, 3000);
      assert.equal(server.host, '127.0.0.1');
    });

    it('throws clear diagnostic when primitive token is missing', () => {
      const PORT = createToken<number>('HttpPort');
      const SERVER = createToken<WebServer>('WebServer');

      class WebServer {
        constructor(public port: number) {}
      }

      const services = new ServiceCollection();
      services.addTransient(SERVER).toClass(WebServer, PORT);

      const sp = services.buildServiceProvider();
      assert.throws(
        () => sp.get(SERVER),
        (err: unknown) => {
          assert.ok(err instanceof ServiceNotFoundError);
          assert.ok(err.message.includes('HttpPort'));
          return true;
        },
      );
    });
  });
});
