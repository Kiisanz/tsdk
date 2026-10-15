import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { describe, it } from 'node:test';
import { HostedService } from '../hosted-services/index.js';
import { HostApplicationLifetime, HostLifecycleCoordinator } from '../lifecycle/index.js';

describe('@tsnx/hosting: Lifecycle Coordinator', () => {
  it('starts services in sequence and stops services in reverse order', async () => {
    const events: string[] = [];

    const service1: HostedService = {
      async start() {
        events.push('start:1');
      },
      async stop() {
        events.push('stop:1');
      },
    };

    const service2: HostedService = {
      async start() {
        events.push('start:2');
      },
      async stop() {
        events.push('stop:2');
      },
    };

    const lifetime = new HostApplicationLifetime();
    const coordinator = new HostLifecycleCoordinator(lifetime, undefined, {
      registerSignalHandlers: false,
    });

    await coordinator.start([service1, service2]);
    assert.deepEqual(events, ['start:1', 'start:2']);

    await coordinator.stop();
    // Reverse shutdown order: 2 stops first, then 1
    assert.deepEqual(events, ['start:1', 'start:2', 'stop:2', 'stop:1']);
  });

  it('rolls back previously started services in reverse order when startup partially fails', async () => {
    const events: string[] = [];

    const dbConnection: HostedService = {
      async start() {
        events.push('start:db');
      },
      async stop() {
        events.push('stop:db');
      },
    };

    const messageQueue: HostedService = {
      async start() {
        events.push('start:mq');
      },
      async stop() {
        events.push('stop:mq');
      },
    };

    const httpServer: HostedService = {
      async start() {
        events.push('start:http');
        throw new Error('EADDRINUSE: Port 8080 already in use');
      },
      async stop() {
        events.push('stop:http');
      },
    };

    const lifetime = new HostApplicationLifetime();
    const coordinator = new HostLifecycleCoordinator(lifetime, undefined, {
      registerSignalHandlers: false,
    });

    await assert.rejects(
      () => coordinator.start([dbConnection, messageQueue, httpServer]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Port 8080'));
        return true;
      },
    );

    // Rollback order: mq stops first, then db! http never started so it is not stopped.
    assert.deepEqual(events, [
      'start:db',
      'start:mq',
      'start:http',
      'stop:mq',
      'stop:db',
    ]);
  });

  it('handles idempotent stop calls safely', async () => {
    let stopCallCount = 0;

    const dummyService: HostedService = {
      async start() {},
      async stop() {
        stopCallCount++;
      },
    };

    const lifetime = new HostApplicationLifetime();
    const coordinator = new HostLifecycleCoordinator(lifetime, undefined, {
      registerSignalHandlers: false,
    });

    await coordinator.start([dummyService]);

    // Call stop twice
    await coordinator.stop();
    await coordinator.stop();

    assert.equal(stopCallCount, 1);
  });

  it('enforces shutdown timeout when a hosted service ignores cancellation and hangs', async () => {
    let stopStarted = false;

    // Rogue service that ignores cancellation and hangs forever
    const rogueService: HostedService = {
      async start() {},
      async stop() {
        stopStarted = true;
        return new Promise(() => {}); // Never resolves!
      },
    };

    const lifetime = new HostApplicationLifetime();
    const coordinator = new HostLifecycleCoordinator(lifetime, undefined, {
      registerSignalHandlers: false,
      shutdownTimeoutMs: 50, // Short timeout for test
    });

    await coordinator.start([rogueService]);

    const startTime = Date.now();
    // coordinator.stop() must force exit after ~50ms instead of hanging forever
    await coordinator.stop();
    const elapsed = Date.now() - startTime;

    assert.equal(stopStarted, true);
    assert.ok(elapsed >= 40 && elapsed < 500, `Elapsed ${elapsed}ms should be around 50ms and not hang`);
  });

  it('L-01: cleans up event listener on external cancellation token after shutdown completes', async () => {
    const dummyService: HostedService = {
      async start() {},
      async stop() {},
    };

    const lifetime = new HostApplicationLifetime();
    const coordinator = new HostLifecycleCoordinator(lifetime, undefined, {
      registerSignalHandlers: false,
    });

    await coordinator.start([dummyService]);

    const externalCts = new AbortController();
    await coordinator.stop(externalCts.signal);

    const listeners = getEventListeners(externalCts.signal, 'abort');
    assert.equal(listeners.length, 0, 'External token must not leak abort listeners after shutdown');
  });
});
