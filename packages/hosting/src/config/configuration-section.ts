import { IConfiguration, IConfigurationProvider, IConfigurationSection } from './types.js';

export class ConfigurationSection implements IConfigurationSection {
  constructor(
    private readonly root: IConfiguration,
    public readonly path: string,
  ) {}

  get key(): string {
    const parts = this.path.split(/[:.]/);
    return parts[parts.length - 1];
  }

  get value(): any {
    return this.root.get(this.path);
  }

  exists(): boolean {
    return this.root.has(this.path);
  }

  get<T = any>(key: string, defaultValue?: T): T {
    const fullPath = this.combinePath(key);
    return this.root.get<T>(fullPath, defaultValue as T);
  }

  getValue<T = string>(key: string): T | undefined;
  getValue(key: string, type: 'string', defaultValue?: string): string;
  getValue(key: string, type: 'number', defaultValue?: number): number;
  getValue(key: string, type: 'boolean', defaultValue?: boolean): boolean;
  getValue(key: string, type?: 'string' | 'number' | 'boolean', defaultValue?: any): any {
    const fullPath = this.combinePath(key);
    return (this.root as any).getValue(fullPath, type, defaultValue);
  }

  getNumber(key: string, defaultValue?: number): number | undefined {
    return this.root.getNumber(this.combinePath(key), defaultValue);
  }

  getString(key: string, defaultValue?: string): string | undefined {
    return this.root.getString(this.combinePath(key), defaultValue);
  }

  getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    return this.root.getBoolean(this.combinePath(key), defaultValue);
  }

  getSection(key: string): IConfigurationSection {
    return this.root.getSection(this.combinePath(key));
  }

  getChildren(): IConfigurationSection[] {
    const data = this.root.get(this.path);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return [];
    }
    return Object.keys(data).map((k) => this.getSection(k));
  }

  has(key: string): boolean {
    return this.root.has(this.combinePath(key));
  }

  getAll(): Record<string, any> {
    const val = this.root.get(this.path);
    return val && typeof val === 'object' && !Array.isArray(val) ? { ...val } : {};
  }

  addProvider(provider: IConfigurationProvider): this {
    this.root.addProvider(provider);
    return this;
  }

  private combinePath(key: string): string {
    if (!key) return this.path;
    return `${this.path}:${key}`;
  }
}
