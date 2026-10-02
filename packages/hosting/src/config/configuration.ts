import { IConfiguration, IConfigurationProvider } from './types.js';

export class Configuration implements IConfiguration {
  private readonly providers: IConfigurationProvider[] = [];
  private mergedData: Record<string, any> = {};

  constructor(providers: IConfigurationProvider[] = []) {
    for (const provider of providers) {
      this.addProvider(provider);
    }
  }

  addProvider(provider: IConfigurationProvider): this {
    this.providers.push(provider);
    this.reload();
    return this;
  }

  reload(): void {
    const combined: Record<string, any> = {};

    for (const provider of this.providers) {
      const data = provider.load();
      this.deepMerge(combined, data);
    }

    this.mergedData = combined;
  }

  get<T = any>(key: string, defaultValue?: T): T {
    const value = this.resolveKey(key);
    if (value === undefined) {
      return defaultValue as T;
    }
    return value as T;
  }

  has(key: string): boolean {
    return this.resolveKey(key) !== undefined;
  }

  getAll(): Record<string, any> {
    return { ...this.mergedData };
  }

  private resolveKey(key: string): any {
    // 1. Direct match (e.g. flat keys like "PORT")
    if (key in this.mergedData) {
      return this.mergedData[key];
    }

    // 2. Case-insensitive direct match
    const lowerKey = key.toLowerCase();
    for (const k of Object.keys(this.mergedData)) {
      if (k.toLowerCase() === lowerKey) {
        return this.mergedData[k];
      }
    }

    // 3. Path resolution (e.g. "Database:Host" or "database.host")
    const parts = key.split(/[:.]/);
    let current: any = this.mergedData;

    for (const part of parts) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }

      // Case-insensitive part lookup
      let matchedKey: string | undefined;
      const lowerPart = part.toLowerCase();
      for (const k of Object.keys(current)) {
        if (k.toLowerCase() === lowerPart) {
          matchedKey = k;
          break;
        }
      }

      if (!matchedKey) {
        return undefined;
      }

      current = current[matchedKey];
    }

    return current;
  }

  private deepMerge(target: Record<string, any>, source: Record<string, any>): void {
    for (const [key, value] of Object.entries(source)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        this.deepMerge(target[key], value);
      } else {
        target[key] = value;
      }
    }
  }
}
