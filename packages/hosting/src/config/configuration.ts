import { IConfiguration, IConfigurationProvider, IConfigurationSection } from './types.js';
import { ConfigurationSection } from './configuration-section.js';

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

  get<T = any>(key: string): T | undefined;
  get<T = any>(key: string, defaultValue: T): T;
  get<T = any>(key: string, defaultValue?: T): T | undefined {
    const raw = this.resolveKey(key);
    if (raw === undefined) {
      return defaultValue;
    }

    // If explicit defaultValue provided, coerce raw to match defaultValue's type
    if (defaultValue !== undefined) {
      if (typeof defaultValue === 'number') {
        const num = Number(raw);
        return (!Number.isNaN(num) ? num : defaultValue) as T;
      }
      if (typeof defaultValue === 'boolean') {
        if (typeof raw === 'boolean') return raw as T;
        const str = String(raw).toLowerCase();
        return (str === 'true' || str === '1') as T;
      }
      if (typeof defaultValue === 'string') {
        return String(raw) as T;
      }
      return raw as T;
    }

    return raw as T;
  }

  getNumber(key: string, defaultValue?: number): number | undefined {
    const raw = this.resolveKey(key);
    if (raw === undefined) {
      return defaultValue;
    }
    if (typeof raw === 'number') {
      return raw;
    }
    const num = Number(raw);
    return !Number.isNaN(num) ? num : defaultValue;
  }

  getString(key: string, defaultValue?: string): string | undefined {
    const raw = this.resolveKey(key);
    if (raw === undefined) {
      return defaultValue;
    }
    return String(raw);
  }

  getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const raw = this.resolveKey(key);
    if (raw === undefined) {
      return defaultValue;
    }
    if (typeof raw === 'boolean') {
      return raw;
    }
    const str = String(raw).trim().toLowerCase();
    if (str === 'true' || str === '1') return true;
    if (str === 'false' || str === '0') return false;
    return defaultValue;
  }

  getValue<T = string>(key: string): T | undefined;
  getValue(key: string, type: 'string', defaultValue?: string): string;
  getValue(key: string, type: 'number', defaultValue?: number): number;
  getValue(key: string, type: 'boolean', defaultValue?: boolean): boolean;
  getValue(key: string, type?: 'string' | 'number' | 'boolean', defaultValue?: any): any {
    if (!type || type === 'string') {
      return this.getString(key, defaultValue);
    }
    if (type === 'number') {
      return this.getNumber(key, defaultValue);
    }
    if (type === 'boolean') {
      return this.getBoolean(key, defaultValue);
    }
    return this.get(key, defaultValue);
  }

  getSection(key: string): IConfigurationSection {
    return new ConfigurationSection(this, key);
  }

  getChildren(): IConfigurationSection[] {
    return Object.keys(this.mergedData).map((k) => this.getSection(k));
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

    // 3. Path resolution (e.g. "Database:Host" or "database.host" or "Database__Host")
    const normalizedKey = key.replace(/__/g, ':');
    const parts = normalizedKey.split(/[:.]/);
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
    for (const [sourceKey, value] of Object.entries(source)) {
      const lowerSourceKey = sourceKey.toLowerCase();
      let matchedKey = sourceKey;
      for (const targetKey of Object.keys(target)) {
        if (targetKey.toLowerCase() === lowerSourceKey) {
          matchedKey = targetKey;
          break;
        }
      }

      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof target[matchedKey] === 'object' &&
        !Array.isArray(target[matchedKey])
      ) {
        this.deepMerge(target[matchedKey], value);
      } else {
        target[matchedKey] = value;
      }
    }
  }
}
