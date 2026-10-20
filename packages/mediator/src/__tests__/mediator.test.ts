import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ServiceCollection, createToken } from '@tsnx/hosting';
import {
  Request,
  Notification,
  IRequestHandler,
  INotificationHandler,
  IPipelineBehavior,
  RequestHandlerDelegate,
  MEDIATOR,
  SENDER,
  PUBLISHER,
  addMediator,
} from '../index.js';

// 1. Fixtures: Requests & Responses
class PingCommand extends Request<string> {
  constructor(public readonly message: string) {
    super();
  }
}

class PingHandler implements IRequestHandler<PingCommand, string> {
  async handle(request: PingCommand, _ct?: AbortSignal): Promise<string> {
    return `Pong: ${request.message}`;
  }
}

class CalculateTaxQuery extends Request<number> {
  constructor(public readonly amount: number) {
    super();
  }
}

class CalculateTaxHandler implements IRequestHandler<CalculateTaxQuery, number> {
  async handle(query: CalculateTaxQuery): Promise<number> {
    return query.amount * 0.11;
  }
}

// 2. Fixtures: Pipeline Behaviors
const executionLog: string[] = [];

class LoggingBehavior implements IPipelineBehavior {
  async handle(_request: any, next: RequestHandlerDelegate<any>, _ct?: AbortSignal): Promise<any> {
    executionLog.push('LoggingBehavior:Before');
    const result = await next();
    executionLog.push('LoggingBehavior:After');
    return result;
  }
}

class ValidationBehavior implements IPipelineBehavior {
  async handle(request: any, next: RequestHandlerDelegate<any>, _ct?: AbortSignal): Promise<any> {
    executionLog.push('ValidationBehavior:Before');
    if ('message' in request && request.message === 'INVALID') {
      throw new Error('Validation failed: Message cannot be INVALID');
    }
    const result = await next();
    executionLog.push('ValidationBehavior:After');
    return result;
  }
}

// 3. Fixtures: Scoped dependency
const SCOPED_ID = createToken<string>('ScopedId');

class ScopedHandler implements IRequestHandler<PingCommand, string> {
  constructor(private readonly scopedId: string) {}
  async handle(req: PingCommand): Promise<string> {
    return `${req.message}-${this.scopedId}`;
  }
}

// 4. Fixtures: Notifications
class OrderCreatedEvent extends Notification {
  constructor(public readonly orderId: string) {
    super();
  }
}

const notificationEvents: string[] = [];

class SendEmailNotification implements INotificationHandler<OrderCreatedEvent> {
  async handle(notification: OrderCreatedEvent): Promise<void> {
    notificationEvents.push(`Email:${notification.orderId}`);
  }
}

class SendSmsNotification implements INotificationHandler<OrderCreatedEvent> {
  async handle(notification: OrderCreatedEvent): Promise<void> {
    notificationEvents.push(`SMS:${notification.orderId}`);
  }
}

describe('@tsnx/mediator Test Suite', () => {
  it('dispatches IRequest to registered IRequestHandler and returns result', async () => {
    const services = new ServiceCollection();
    addMediator(services, (opt) => {
      opt.register(PingCommand, PingHandler);
      opt.register(CalculateTaxQuery, CalculateTaxHandler);
    });

    const sp = services.buildServiceProvider();
    const scope = sp.createScope();
    const mediator = scope.get(MEDIATOR);

    const pingResult = await mediator.send(new PingCommand('Hello'));
    assert.equal(pingResult, 'Pong: Hello');

    const taxResult = await mediator.send(new CalculateTaxQuery(100));
    assert.equal(taxResult, 11);
  });

  it('resolves ISender and IPublisher alias tokens correctly', async () => {
    const services = new ServiceCollection();
    addMediator(services, (opt) => {
      opt.register(PingCommand, PingHandler);
    });

    const sp = services.buildServiceProvider();
    const scope = sp.createScope();
    const sender = scope.get(SENDER);
    const publisher = scope.get(PUBLISHER);

    assert.ok(sender);
    assert.ok(publisher);
    assert.equal(await sender.send(new PingCommand('Aliased')), 'Pong: Aliased');
  });

  it('executes pipeline behaviors in Onion Architecture (FIFO entry, LIFO exit)', async () => {
    executionLog.length = 0;
    const services = new ServiceCollection();
    addMediator(services, (opt) => {
      opt.register(PingCommand, PingHandler);
      opt.addBehavior(LoggingBehavior);
      opt.addBehavior(ValidationBehavior);
    });

    const sp = services.buildServiceProvider();
    const scope = sp.createScope();
    const mediator = scope.get(MEDIATOR);

    const result = await mediator.send(new PingCommand('TSNX'));
    assert.equal(result, 'Pong: TSNX');

    assert.deepEqual(executionLog, [
      'LoggingBehavior:Before',
      'ValidationBehavior:Before',
      'ValidationBehavior:After',
      'LoggingBehavior:After',
    ]);
  });

  it('short-circuits pipeline and aborts handler execution when behavior throws', async () => {
    executionLog.length = 0;
    const services = new ServiceCollection();
    addMediator(services, (opt) => {
      opt.register(PingCommand, PingHandler);
      opt.addBehavior(LoggingBehavior);
      opt.addBehavior(ValidationBehavior);
    });

    const sp = services.buildServiceProvider();
    const scope = sp.createScope();
    const mediator = scope.get(MEDIATOR);

    await assert.rejects(
      async () => {
        await mediator.send(new PingCommand('INVALID'));
      },
      { message: 'Validation failed: Message cannot be INVALID' },
    );

    // LoggingBehavior:Before ran, ValidationBehavior threw before handler, so handler and After never ran
    assert.deepEqual(executionLog, ['LoggingBehavior:Before', 'ValidationBehavior:Before']);
  });

  it('resolves handlers with Scoped lifetime matching the current request scope', async () => {
    const services = new ServiceCollection();
    let counter = 0;
    services.addScoped(SCOPED_ID, () => `scope-${++counter}`);

    addMediator(services, (opt) => {
      opt.register(PingCommand, ScopedHandler);
    });

    // Register ScopedHandler with dependency SCOPED_ID as scoped
    services.addScoped(ScopedHandler).toClass(ScopedHandler, SCOPED_ID);

    const sp = services.buildServiceProvider();

    // Scope 1
    const scope1 = sp.createScope();
    const mediator1 = scope1.get(MEDIATOR);
    assert.equal(await mediator1.send(new PingCommand('Test')), 'Test-scope-1');

    // Scope 2
    const scope2 = sp.createScope();
    const mediator2 = scope2.get(MEDIATOR);
    assert.equal(await mediator2.send(new PingCommand('Test')), 'Test-scope-2');
  });

  it('aborts execution when cancellationToken is pre-aborted or cancelled', async () => {
    const services = new ServiceCollection();
    addMediator(services, (opt) => {
      opt.register(PingCommand, PingHandler);
    });

    const sp = services.buildServiceProvider();
    const scope = sp.createScope();
    const mediator = scope.get(MEDIATOR);

    const controller = new AbortController();
    controller.abort(new Error('Request cancelled by client'));

    await assert.rejects(
      async () => {
        await mediator.send(new PingCommand('AbortTest'), controller.signal);
      },
      { message: 'Request cancelled by client' },
    );
  });

  it('publishes notifications to all registered handlers (parallel and sequential)', async () => {
    notificationEvents.length = 0;
    const services = new ServiceCollection();
    addMediator(services, (opt) => {
      opt.registerNotification(OrderCreatedEvent, SendEmailNotification, SendSmsNotification);
    });

    const sp = services.buildServiceProvider();
    const scope = sp.createScope();
    const mediator = scope.get(MEDIATOR);

    await mediator.publish(new OrderCreatedEvent('ORD-1234'));

    assert.ok(notificationEvents.includes('Email:ORD-1234'));
    assert.ok(notificationEvents.includes('SMS:ORD-1234'));
    assert.equal(notificationEvents.length, 2);
  });

  it('throws descriptive diagnostic error when no handler is registered for request', async () => {
    const services = new ServiceCollection();
    addMediator(services); // No handlers registered

    const sp = services.buildServiceProvider();
    const scope = sp.createScope();
    const mediator = scope.get(MEDIATOR);

    await assert.rejects(
      async () => {
        await mediator.send(new PingCommand('NoHandler'));
      },
      /No request handler registered for "PingCommand"/,
    );
  });
});
