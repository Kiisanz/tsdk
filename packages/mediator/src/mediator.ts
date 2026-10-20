import type { IServiceProvider, Constructor } from '@tsnx/hosting-abstractions';
import type {
  IMediator,
  IRequest,
  IRequestHandler,
  INotificationHandler,
  IPipelineBehavior,
  RequestHandlerDelegate,
} from './types.js';
import type { MediatorRegistry } from './builder.js';

export class Mediator implements IMediator {
  constructor(
    private readonly sp: IServiceProvider,
    private readonly registry: MediatorRegistry,
  ) {}

  public async send<TResponse>(
    request: IRequest<TResponse> | object,
    cancellationToken?: AbortSignal,
  ): Promise<TResponse> {
    if (!request) {
      throw new Error('Mediator.send: request cannot be null or undefined.');
    }

    if (cancellationToken?.aborted) {
      throw cancellationToken.reason ?? new Error('Operation was cancelled.');
    }

    const reqCtor = request.constructor as Constructor<any>;
    const handlerCtor = this.registry.requestHandlers.get(reqCtor);

    if (!handlerCtor) {
      throw new Error(
        `Mediator: No request handler registered for "${reqCtor.name}". Register it with services.addMediator(m => m.register(${reqCtor.name}, ...)).`,
      );
    }

    const handler = this.sp.get<IRequestHandler<any, any>>(handlerCtor);

    let currentDelegate: RequestHandlerDelegate<TResponse> = () => {
      if (cancellationToken?.aborted) {
        throw cancellationToken.reason ?? new Error('Operation was cancelled.');
      }
      return Promise.resolve(handler.handle(request, cancellationToken));
    };

    // Build onion pipeline in reverse order so the first registered behavior executes first
    for (let i = this.registry.behaviors.length - 1; i >= 0; i--) {
      const behaviorCtor = this.registry.behaviors[i];
      const next = currentDelegate;
      currentDelegate = () => {
        if (cancellationToken?.aborted) {
          throw cancellationToken.reason ?? new Error('Operation was cancelled.');
        }
        const behavior = this.sp.get<IPipelineBehavior>(behaviorCtor);
        return behavior.handle(request, next, cancellationToken);
      };
    }

    return await currentDelegate();
  }

  public async publish<TNotification extends object>(
    notification: TNotification,
    cancellationToken?: AbortSignal,
  ): Promise<void> {
    if (!notification) {
      throw new Error('Mediator.publish: notification cannot be null or undefined.');
    }

    if (cancellationToken?.aborted) {
      throw cancellationToken.reason ?? new Error('Operation was cancelled.');
    }

    const notifCtor = notification.constructor as Constructor<any>;
    const handlerCtors = this.registry.notificationHandlers.get(notifCtor);

    if (!handlerCtors || handlerCtors.size === 0) {
      return;
    }

    if (this.registry.publishStrategy === 'sequential') {
      for (const ctor of handlerCtors) {
        if (cancellationToken?.aborted) {
          throw cancellationToken.reason ?? new Error('Operation was cancelled.');
        }
        const handler = this.sp.get<INotificationHandler<any>>(ctor);
        await handler.handle(notification, cancellationToken);
      }
    } else {
      const promises = Array.from(handlerCtors).map(async (ctor) => {
        if (cancellationToken?.aborted) {
          throw cancellationToken.reason ?? new Error('Operation was cancelled.');
        }
        const handler = this.sp.get<INotificationHandler<any>>(ctor);
        return await handler.handle(notification, cancellationToken);
      });
      await Promise.all(promises);
    }
  }
}
