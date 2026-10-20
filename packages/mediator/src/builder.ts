import type {
  Constructor,
  IServiceCollection,
} from '@tsnx/hosting-abstractions';
import type {
  IRequestHandler,
  INotificationHandler,
  IPipelineBehavior,
  PublishStrategy,
} from './types.js';

export class MediatorRegistry {
  public readonly requestHandlers = new Map<Constructor<any>, Constructor<any>>();
  public readonly notificationHandlers = new Map<Constructor<any>, Set<Constructor<any>>>();
  public readonly behaviors: Constructor<IPipelineBehavior>[] = [];
  public publishStrategy: PublishStrategy = 'parallel';
}

export class MediatorOptionsBuilder {
  constructor(
    private readonly services: IServiceCollection,
    public readonly registry: MediatorRegistry,
  ) {}

  /**
   * Registers a single request handler for a given IRequest (Command or Query).
   * Handlers are registered with Scoped lifetime.
   */
  public register<TRequest extends object, TResponse = any>(
    requestClass: Constructor<TRequest>,
    handlerClass: Constructor<IRequestHandler<TRequest, TResponse>>,
  ): this {
    this.registry.requestHandlers.set(requestClass, handlerClass);
    this.services.addScoped(handlerClass).toClass();
    return this;
  }

  /**
   * Registers one or more broadcast notification handlers for an INotification event.
   * Handlers are registered with Scoped lifetime.
   */
  public registerNotification<TNotification extends object>(
    notificationClass: Constructor<TNotification>,
    ...handlerClasses: Constructor<INotificationHandler<TNotification>>[]
  ): this {
    let handlers = this.registry.notificationHandlers.get(notificationClass);
    if (!handlers) {
      handlers = new Set();
      this.registry.notificationHandlers.set(notificationClass, handlers);
    }

    for (const handlerClass of handlerClasses) {
      handlers.add(handlerClass);
      this.services.addScoped(handlerClass).toClass();
    }

    return this;
  }

  /**
   * Adds a global pipeline behavior (middleware) executed around request handlers in FIFO order.
   * Behaviors are registered with Scoped lifetime.
   */
  public addBehavior(behaviorClass: Constructor<IPipelineBehavior>): this {
    this.registry.behaviors.push(behaviorClass);
    this.services.addScoped(behaviorClass).toClass();
    return this;
  }

  /**
   * Configures the dispatching strategy for broadcast notifications.
   * - 'parallel': Executes all handlers concurrently using Promise.all (default).
   * - 'sequential': Executes handlers sequentially in order of registration.
   */
  public setPublishStrategy(strategy: PublishStrategy): this {
    this.registry.publishStrategy = strategy;
    return this;
  }
}
