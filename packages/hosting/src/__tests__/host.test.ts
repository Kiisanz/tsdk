import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppHost, BackgroundService } from '../index.js';

describe('@tsnx/hosting: AppHost & HostApplicationBuilder', () => {
  it('distinguishes start() and run() contracts', async () => {
    let serviceRunning = false;
    let serviceStopped = false;

    class TestWorker extends BackgroundService {
      async execute(stoppingToken: AbortSignal): Promise<void> {
        serviceRunning = true;
        while (!stoppingToken.aborted) {
          await new Promise((r) => setTimeout(r, 10));
        }
        serviceStopped = true;
      }
    }

    const builder = AppHost.createBuilder(['--MyKey=CustomValue']);
    builder.options.registerSignalHandlers = false;

    builder.services.addSingleton('Greeting', 'Hello TSDK');
    builder.addHostedService(() => new TestWorker());

    const app = builder.build();

    // Verify DI and Config access
    assert.equal(app.services.get('Greeting'), 'Hello TSDK');
    assert.equal(app.config.get('MyKey'), 'CustomValue');

    // 1. app.start() returns immediately while background service runs
    await app.start();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(serviceRunning, true);
    assert.equal(serviceStopped, false);

    // 2. app.stop() stops host and background service
    await app.stop();
    assert.equal(serviceStopped, true);
  });

  it('runs app.run() and stops gracefully when stopApplication is invoked', async () => {
    const builder = AppHost.createBuilder();
    builder.options.registerSignalHandlers = false;

    let stoppedViaCallback = false;

    class AutoStopService extends BackgroundService {
      async execute(_stoppingToken: AbortSignal): Promise<void> {
        // Run briefly then trigger host shutdown from within application
        await new Promise((r) => setTimeout(r, 25));
        stoppedViaCallback = true;
      }
    }

    builder.addHostedService(() => new AutoStopService());
    const app = builder.build();

    // Schedule stop after 40ms
    setTimeout(() => {
      app.stop();
    }, 40);

    // app.run() blocks until shutdown occurs
    await app.run();

    assert.equal(stoppedViaCallback, true);
  });

  it('propagates BackgroundService execution failure to app.run()', async () => {
    const builder = AppHost.createBuilder();
    builder.options.registerSignalHandlers = false;

    class FailingWorker extends BackgroundService {
      async execute(_stoppingToken: AbortSignal): Promise<void> {
        // Run briefly then fail
        await new Promise((r) => setTimeout(r, 15));
        throw new Error('Database connection lost in worker');
      }
    }

    builder.addHostedService(() => new FailingWorker());
    const app = builder.build();

    // app.run() must reject with the error thrown inside BackgroundService.execute()
    await assert.rejects(
      () => app.run(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Database connection lost in worker'));
        return true;
      },
    );
  });

  it('maintains consistent state during concurrent start() and stop() calls', async () => {
    const builder = AppHost.createBuilder();
    builder.options.registerSignalHandlers = false;

    let workerStarted = false;
    let workerStopped = false;

    class SlowStartWorker extends BackgroundService {
      override async start(signal: AbortSignal): Promise<void> {
        await new Promise((r) => setTimeout(r, 20));
        workerStarted = true;
        await super.start(signal);
      }

      override async stop(signal: AbortSignal): Promise<void> {
        workerStopped = true;
        await super.stop(signal);
      }

      async execute(_stoppingToken: AbortSignal): Promise<void> {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    builder.addHostedService(() => new SlowStartWorker());
    const app = builder.build();

    // Trigger start and stop concurrently
    const startPromise = app.start();
    const stopPromise = app.stop();

    await Promise.all([startPromise, stopPromise]);

    assert.equal(workerStarted, true);
    assert.equal(workerStopped, true);
    assert.equal(app.currentState, 'stopped');
  });
});
