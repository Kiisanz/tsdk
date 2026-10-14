export interface IHostApplicationLifetime {
  readonly applicationStarted: AbortSignal;
  readonly applicationStopping: AbortSignal;
  readonly applicationStopped: AbortSignal;
  stopApplication(): void;
}
