export type ServiceLifetime = 'singleton' | 'scoped' | 'transient';

export type ServiceIdentifier<T = any> =
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
