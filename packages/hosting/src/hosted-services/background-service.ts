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

    // Wait for execute() to finish or the shutdown signal to abort
    const abortPromise = new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
      } else {
        signal.addEventListener('abort', () => resolve(), { once: true });
      }
    });

    await Promise.race([this.executingTaskPromise, abortPromise]);
  }
}
