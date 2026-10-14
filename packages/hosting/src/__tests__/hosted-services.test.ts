import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { describe, it } from 'node:test';
import { BackgroundService } from '../hosted-services/index.js';

describe('@tsnx/hosting: Hosted Services', () => {
  it('executes background service and signals cancellation gracefully on stop', async () => {
    let loopCount = 0;
    let stoppedCleanly = false;

    class TestWorker extends BackgroundService {
      async execute(stoppingToken: AbortSignal): Promise<void> {
        while (!stoppingToken.aborted) {
          loopCount++;
          await new Promise((r) => setTimeout(r, 10));
        }
        stoppedCleanly = true;
      }
    }

    const worker = new TestWorker();
    const startCts = new AbortController();
    await worker.start(startCts.signal);

    // Let it run for a few ticks
    await new Promise((r) => setTimeout(r, 35));
    assert.ok(loopCount >= 2);

    // Stop worker
    const stopCts = new AbortController();
    await worker.stop(stopCts.signal);

    assert.equal(stoppedCleanly, true);

    // L-01: Verify abort listener was removed from stop token
    const listeners = getEventListeners(stopCts.signal, 'abort');
    assert.equal(listeners.length, 0, 'Abort listener must be cleaned up from stop signal');
  });
});
