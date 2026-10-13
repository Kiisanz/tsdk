import { ILogger, ILoggerFactory, LogLevel } from './types.js';

function formatLevel(level: LogLevel): string {
  switch (level) {
    case LogLevel.Trace:
      return 'trce';
    case LogLevel.Debug:
      return 'dbug';
    case LogLevel.Information:
      return 'info';
    case LogLevel.Warning:
      return 'warn';
    case LogLevel.Error:
      return 'fail';
    case LogLevel.Critical:
      return 'crit';
    default:
      return 'none';
  }
}

export class ConsoleLogger implements ILogger {
  constructor(
    public readonly categoryName: string,
    private readonly getMinLevel: () => LogLevel,
  ) {}

  isEnabled(level: LogLevel): boolean {
    return level >= this.getMinLevel() && level < LogLevel.None;
  }

  log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.isEnabled(level)) return;

    const timestamp = new Date().toISOString().slice(11, 19);
    const prefix = `[${timestamp}] ${formatLevel(level)}: ${this.categoryName}[0]`;

    if (level >= LogLevel.Error) {
      console.error(`${prefix}\n      ${message}`, ...args);
    } else if (level === LogLevel.Warning) {
      console.warn(`${prefix}\n      ${message}`, ...args);
    } else {
      console.log(`${prefix}\n      ${message}`, ...args);
    }
  }

  trace(message: string, ...args: any[]): void {
    this.log(LogLevel.Trace, message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.Debug, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.Information, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.Warning, message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.Error, message, ...args);
  }

  critical(message: string, ...args: any[]): void {
    this.log(LogLevel.Critical, message, ...args);
  }
}

export class LoggerFactory implements ILoggerFactory {
  private minLevel: LogLevel = LogLevel.Information;
  private readonly loggers = new Map<string, ConsoleLogger>();

  constructor(initialMinLevel: LogLevel = LogLevel.Information) {
    this.minLevel = initialMinLevel;
  }

  setMinimumLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getMinimumLevel(): LogLevel {
    return this.minLevel;
  }

  createLogger(categoryName: string): ILogger {
    if (!this.loggers.has(categoryName)) {
      this.loggers.set(
        categoryName,
        new ConsoleLogger(categoryName, () => this.minLevel),
      );
    }
    return this.loggers.get(categoryName)!;
  }
}
