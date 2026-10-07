import type { ServiceToken, InjectionToken, IServiceProvider } from '../di/types.js';

export interface IOptions<T> {
  readonly value: T;
}

export interface IOptionsSnapshot<T> {
  readonly value: T;
}

export type OptionsValidatorFn<T> = (options: T) => boolean | string;

export interface IOptionsBuilder<T> {
  bindConfiguration(sectionName: string): this;
  configure(configureFn: (options: T, sp: IServiceProvider) => void | T): this;
  validate(validator: OptionsValidatorFn<T>, failureMessage?: string): this;
  validateOnStart(): this;
}

const optionsTokenMap = new Map<any, ServiceToken<any>>();
const optionsSnapshotTokenMap = new Map<any, ServiceToken<any>>();

export function optionsToken<T>(token: InjectionToken<T> | ServiceToken<T> | string | symbol): ServiceToken<IOptions<T>> {
  if (!optionsTokenMap.has(token)) {
    const desc = typeof token === 'symbol' ? token.description || 'Options' : String(token);
    optionsTokenMap.set(token, Symbol(`IOptions<${desc}>`) as ServiceToken<IOptions<T>>);
  }
  return optionsTokenMap.get(token)!;
}

export function optionsSnapshotToken<T>(token: InjectionToken<T> | ServiceToken<T> | string | symbol): ServiceToken<IOptionsSnapshot<T>> {
  if (!optionsSnapshotTokenMap.has(token)) {
    const desc = typeof token === 'symbol' ? token.description || 'OptionsSnapshot' : String(token);
    optionsSnapshotTokenMap.set(token, Symbol(`IOptionsSnapshot<${desc}>`) as ServiceToken<IOptionsSnapshot<T>>);
  }
  return optionsSnapshotTokenMap.get(token)!;
}
