export interface HostedService {
  start(signal: AbortSignal): Promise<void>;
  stop(signal: AbortSignal): Promise<void>;
}

export type IHostedService = HostedService;

export const HOSTED_SERVICE_TOKEN = Symbol('TSNX:HostedService');
