export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Information = 2,
  Warning = 3,
  Error = 4,
  Critical = 5,
  None = 6,
}

export interface LogEventMetadata {
  eventId: number;
}

export interface ILogger {
  readonly categoryName: string;
  isEnabled(level: LogLevel): boolean;
  log(level: LogLevel, message: string, ...args: any[]): void;
  logEvent(level: LogLevel, metadata: LogEventMetadata, message: string, ...args: any[]): void;
  trace(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  critical(message: string, ...args: any[]): void;
}

export interface ILoggerFactory {
  createLogger(categoryName: string): ILogger;
  setMinimumLevel(level: LogLevel): void;
}
