import { IConfiguration } from '../config/types.js';
import { IServiceProviderRoot } from '../di/types.js';
import { HostedService } from '../hosted-services/types.js';
import { HostLifecycleCoordinator } from '../lifecycle/host-lifetime.js';
import { HostApplicationBuilder } from './host-application-builder.js';
import { IHost } from './types.js';

export enum HostState {
  Created = 'created',
  Starting = 'starting',
  Started = 'started',
  Stopping = 'stopping',
  Stopped = 'stopped',
}

export class AppHost implements IHost {
  private state = HostState.Created;
  private startPromise?: Promise<void>;
  private stopPromise?: Promise<void>;
  private fatalExecutionError?: unknown;

  constructor(
    public readonly services: IServiceProviderRoot,
    public readonly config: IConfiguration,
    private readonly hostedServices: readonly HostedService[],
    private readonly coordinator: HostLifecycleCoordinator,
    private readonly startupValidators: readonly (() => void)[] = [],
  ) {
    // 1. BackgroundService failure propagation:
    // If a background service fails after startup, notify the host and trigger shutdown
    for (const service of this.hostedServices) {
      if (typeof (service as any).setErrorCallback === 'function') {
        (service as any).setErrorCallback((err: unknown) => {
          this.fatalExecutionError = err;
          this.coordinator.lifetime.stopApplication();
        });
      }
    }
  }

  static createBuilder(args: string[] = process.argv.slice(2)): HostApplicationBuilder {
    return new HostApplicationBuilder(args);
  }

  get currentState(): HostState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.state === HostState.Started) {
      return;
    }
    if (this.state === HostState.Starting && this.startPromise) {
      return this.startPromise;
    }
    if (this.state === HostState.Stopping || this.state === HostState.Stopped) {
      throw new Error(`Cannot start host that is ${this.state}.`);
    }

    this.state = HostState.Starting;
    this.startPromise = (async () => {
      try {
        // Run all startup validators (e.g. options validation from validateOnStart())
        for (const validator of this.startupValidators) {
          validator();
        }

        await this.coordinator.start(this.hostedServices);
        this.state = HostState.Started;
      } catch (err: unknown) {
        this.state = HostState.Stopped;
        throw err;
      }
    })();

    return this.startPromise;
  }

  async run(): Promise<void> {
    await this.start();

    // Wait until application is stopped
    await new Promise<void>((resolve) => {
      const stoppedSignal = this.coordinator.lifetime.applicationStopped;
      if (stoppedSignal.aborted) {
        resolve();
      } else {
        stoppedSignal.addEventListener('abort', () => resolve(), { once: true });
      }
    });

    await this.dispose();

    // Propagate background service failure if one occurred during execution
    if (this.fatalExecutionError) {
      throw this.fatalExecutionError;
    }
  }

  async stop(cancellationToken?: AbortSignal): Promise<void> {
    if (this.state === HostState.Stopped) {
      return;
    }
    if (this.state === HostState.Stopping && this.stopPromise) {
      return this.stopPromise;
    }

    // If starting is in-flight, await start before stopping to maintain consistent state
    if (this.state === HostState.Starting && this.startPromise) {
      try {
        await this.startPromise;
      } catch {
        // Startup failed and was already rolled back by coordinator
        return;
      }
    }

    this.state = HostState.Stopping;
    this.stopPromise = (async () => {
      try {
        await this.coordinator.stop(cancellationToken);
      } finally {
        this.state = HostState.Stopped;
      }
    })();

    return this.stopPromise;
  }

  async dispose(): Promise<void> {
    await this.stop();
    if (typeof (this.services as any).dispose === 'function') {
      await (this.services as any).dispose();
    }
  }
}
