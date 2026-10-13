export interface IConfigurationProvider {
  readonly name: string;
  load(): Record<string, any>;
}

export interface IConfiguration {
  get<T = any>(key: string, defaultValue?: T): T;
  has(key: string): boolean;
  getAll(): Record<string, any>;
  addProvider(provider: IConfigurationProvider): this;
}
