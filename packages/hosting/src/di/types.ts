import type { HostedService } from '../hosted-services/types.js';

export type ServiceLifetime = 'singleton' | 'scoped' | 'transient';

declare const tokenType: unique symbol;

export type ServiceToken<T> = symbol & {
  readonly [tokenType]?: (value: T) => T;
};

export function createToken<T>(description: string): ServiceToken<T> {
  return Symbol(description) as ServiceToken<T>;
}

export type ServiceIdentifier<T = any> =
  | ServiceToken<T>
  | string
  | symbol
  | (new (...args: any[]) => T)
  | (abstract new (...args: any[]) => T);

export type ServiceFactory<T = any> = (provider: IServiceProvider) => T;

export interface ServiceDescriptor<T = any> {
  token: ServiceIdentifier<T>;
  lifetime: ServiceLifetime;
  factory?: ServiceFactory<T>;
  instance?: T;
  implementationType?: new (...args: any[]) => T;
  dependencies?: ServiceToken<any>[];
}

export interface IServiceProvider {
  get<T>(token: ServiceToken<T>): T;
  get<T = any>(token: ServiceIdentifier<T>): T;
  getOptional<T>(token: ServiceToken<T>): T | undefined;
  getOptional<T = any>(token: ServiceIdentifier<T>): T | undefined;
}

export interface IServiceProviderScope extends IServiceProvider {
  readonly serviceProvider: IServiceProvider;
  dispose(): Promise<void>;
  [Symbol.asyncDispose]?(): Promise<void>;
}

export interface IServiceProviderRoot extends IServiceProvider {
  createScope(): IServiceProviderScope;
  dispose(): Promise<void>;
  [Symbol.asyncDispose]?(): Promise<void>;
}

export type IServiceScope = IServiceProviderScope;

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface ServiceProviderOptions {
  validateOnBuild?: boolean;
  validateScopes?: boolean;
}

export interface IBindingBuilder<T> {
  toClass<TArgs extends any[]>(
    ctor: new (...args: TArgs) => T,
    ...tokens: { [K in keyof TArgs]: ServiceToken<TArgs[K]> }
  ): IServiceCollection;
  toFactory(factory: (sp: IServiceProvider) => T): IServiceCollection;
  toInstance(instance: T): IServiceCollection;
}

export interface IHostedServiceBindingBuilder {
  toClass<T extends HostedService, TArgs extends any[]>(
    ctor: new (...args: TArgs) => T,
    ...tokens: { [K in keyof TArgs]: ServiceToken<TArgs[K]> }
  ): IServiceCollection;
  toFactory<T extends HostedService>(
    factory: (sp: IServiceProvider) => T
  ): IServiceCollection;
}

export interface IServiceCollection extends Iterable<ServiceDescriptor> {
  readonly length: number;
  add<T>(descriptor: ServiceDescriptor<T>): this;

  // Singleton
  addSingleton<T>(token: ServiceToken<T>): IBindingBuilder<T>;
  addSingleton<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceToken<T>, instance: T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, instance: T): this;
  addSingleton<T>(implementationType: new (...args: any[]) => T): this;

  // Scoped
  addScoped<T>(token: ServiceToken<T>): IBindingBuilder<T>;
  addScoped<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(implementationType: new (...args: any[]) => T): this;

  // Transient
  addTransient<T>(token: ServiceToken<T>): IBindingBuilder<T>;
  addTransient<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(implementationType: new (...args: any[]) => T): this;

  // Hosted Service
  addHostedService(): IHostedServiceBindingBuilder;
  addHostedService<T extends HostedService>(factory: (sp: IServiceProvider) => T): this;

  // TryAdd variants
  tryAdd<T>(descriptor: ServiceDescriptor<T>): boolean;
  tryAddSingleton<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddSingleton<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddSingleton<T>(token: ServiceToken<T>, instance: T): boolean;
  tryAddSingleton<T>(token: ServiceIdentifier<T>, instance: T): boolean;
  tryAddScoped<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddScoped<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddTransient<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): boolean;
  tryAddTransient<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): boolean;

  find(token: ServiceIdentifier): ServiceDescriptor | undefined;
  findAll(token: ServiceIdentifier): ServiceDescriptor[];
  buildServiceProvider(options?: ServiceProviderOptions): IServiceProviderRoot;
}
