import { IConfiguration } from '../config/types.js';
import { IServiceProviderRoot } from '../di/types.js';

export interface IHost {
  readonly services: IServiceProviderRoot;
  readonly config: IConfiguration;
  readonly currentState?: string;
  start(): Promise<void>;
  run(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export interface HostOptions {
  shutdownTimeoutMs?: number;
  registerSignalHandlers?: boolean;
}
