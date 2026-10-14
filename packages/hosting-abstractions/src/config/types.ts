export interface IConfigurationProvider {
  readonly name: string;
  load(): Record<string, any>;
}

export interface IConfigurationSection extends IConfiguration {
  readonly key: string;
  readonly path: string;
  readonly value: any;
  exists(): boolean;
}

export interface IConfiguration {
  get<T = any>(key: string): T | undefined;
  get<T = any>(key: string, defaultValue: T): T;
  getValue<T = string>(key: string): T | undefined;
  getValue(key: string, type: 'string', defaultValue?: string): string;
  getValue(key: string, type: 'number', defaultValue?: number): number;
  getValue(key: string, type: 'boolean', defaultValue?: boolean): boolean;
  getNumber(key: string, defaultValue?: number): number | undefined;
  getString(key: string, defaultValue?: string): string | undefined;
  getBoolean(key: string, defaultValue?: boolean): boolean | undefined;
  getSection(key: string): IConfigurationSection;
  getChildren(): IConfigurationSection[];
  has(key: string): boolean;
  getAll(): Record<string, any>;
  addProvider(provider: IConfigurationProvider): this;
}
