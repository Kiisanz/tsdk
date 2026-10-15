import type { IConfiguration } from '../config/types.js';
import type { IServiceProviderRoot, ServiceProviderOptions } from '../di/types.js';
import type { IHostApplicationLifetime } from '../lifecycle/types.js';

export interface IHost {
  readonly services: IServiceProviderRoot;
  readonly config: IConfiguration;
  readonly currentState?: string;
  readonly lifetime?: IHostApplicationLifetime;
  start(): Promise<void>;
  run(): Promise<void>;
  stop(cancellationToken?: AbortSignal): Promise<void>;
  dispose(): Promise<void>;
}

export interface HostOptions {
  shutdownTimeoutMs?: number;
  registerSignalHandlers?: boolean;
  serviceProviderOptions?: ServiceProviderOptions;
  contentRootPath?: string;
}

export interface HostApplicationBuilderSettings {
  args?: string[];
  environment?: string;
  contentRootPath?: string;
  serviceProviderOptions?: ServiceProviderOptions;
}

