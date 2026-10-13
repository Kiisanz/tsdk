import type { HostedService } from '../hosted-services/types.js';

export type ServiceLifetime = 'singleton' | 'scoped' | 'transient';

export type ServiceToken<T> = symbol & { readonly __serviceType?: T };

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
}

export interface IServiceProvider {
  get<T = any>(token: ServiceIdentifier<T>): T;
  getOptional<T = any>(token: ServiceIdentifier<T>): T | undefined;
  createScope(): IServiceScope;
}

export interface IServiceScope {
  serviceProvider: IServiceProvider;
  dispose(): Promise<void>;
}

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface IServiceCollection extends Iterable<ServiceDescriptor> {
  readonly length: number;
  add<T>(descriptor: ServiceDescriptor<T>): this;
  
  // Singleton overloads
  addSingleton<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addSingleton<T>(token: ServiceToken<T>, instance: T): this;
  addSingleton<T>(token: ServiceIdentifier<T>, instance: T): this;
  addSingleton<T>(implementationType: new (...args: any[]) => T): this;

  // Scoped overloads
  addScoped<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addScoped<T>(implementationType: new (...args: any[]) => T): this;

  // Transient overloads
  addTransient<T>(token: ServiceToken<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(token: ServiceIdentifier<T>, factory: (provider: IServiceProvider) => T): this;
  addTransient<T>(implementationType: new (...args: any[]) => T): this;

  // Hosted Service
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
  buildServiceProvider(): IServiceProvider;
}
