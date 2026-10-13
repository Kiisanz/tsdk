export interface HostedService {
  start(signal: AbortSignal): Promise<void>;
  stop(signal: AbortSignal): Promise<void>;
}

export const HOSTED_SERVICE_TOKEN = Symbol('TSDK:HostedService');
