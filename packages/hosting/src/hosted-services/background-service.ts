import { HostedService } from './types.js';

export abstract class BackgroundService implements HostedService {
  private stoppingCts?: AbortController;
  private executingTaskPromise?: Promise<void>;
  private executionErrorValue?: unknown;
  private errorCallback?: (err: unknown) => void;

  abstract execute(stoppingToken: AbortSignal): Promise<void>;

  get executingTask(): Promise<void> | undefined {
    return this.executingTaskPromise;
  }

  get executionError(): unknown {
    return this.executionErrorValue;
  }

  setErrorCallback(callback: (err: unknown) => void): void {
    this.errorCallback = callback;
  }

  async start(_signal: AbortSignal): Promise<void> {
    this.stoppingCts = new AbortController();

    // Trigger execute in background without blocking start()
    this.executingTaskPromise = this.execute(this.stoppingCts.signal)
      .catch((err: unknown) => {
        // Exclude expected cancellations when the stopping token has been aborted (e.g. during normal host shutdown)
        const isCancellation =
          Boolean(this.stoppingCts?.signal.aborted) &&
          (err === this.stoppingCts?.signal.reason ||
            (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError'));

        if (isCancellation) {
          return;
        }

        this.executionErrorValue = err;
        if (this.errorCallback) {
          this.errorCallback(err);
        } else {
          console.error(`[BackgroundService] Unhandled exception in background service:`, err);
        }
      });
  }

  async stop(signal: AbortSignal): Promise<void> {
    if (!this.executingTaskPromise) {
      return;
    }

    // Signal cancellation to execute()
    this.stoppingCts?.abort();

    if (signal.aborted) {
      return;
    }

    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<void>((resolve) => {
      onAbort = () => resolve();
      signal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      await Promise.race([this.executingTaskPromise, abortPromise]);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }
}
