import { Configuration } from '../config/configuration.js';
import { IServiceCollection, IServiceProvider, InjectionToken, ServiceToken } from '../di/types.js';
import { bindOptions } from './options-binder.js';
import { OptionsValidationError } from './options-errors.js';
import { OptionsSnapshot, OptionsWrapper } from './options-wrapper.js';
import { STARTUP_VALIDATOR_TOKEN, StartupValidator } from './startup-validator.js';
import { IOptionsBuilder, OptionsValidatorFn, optionsSnapshotToken, optionsToken } from './types.js';

export class OptionsBuilder<T> implements IOptionsBuilder<T> {
  private sectionName?: string;
  private readonly configureFns: Array<(options: T, sp: IServiceProvider) => void | T> = [];
  private readonly validators: Array<{ validator: OptionsValidatorFn<T>; failureMessage?: string }> = [];
  private isValidateOnStart = false;

  constructor(
    private readonly services: IServiceCollection,
    private readonly token: InjectionToken<T> | ServiceToken<T> | string,
  ) {
    this.registerServices();
  }

  bindConfiguration(sectionName: string): this {
    this.sectionName = sectionName;
    return this;
  }

  configure(configureFn: (options: T, sp: IServiceProvider) => void | T): this {
    this.configureFns.push(configureFn);
    return this;
  }

  validate(validator: OptionsValidatorFn<T>, failureMessage?: string): this {
    this.validators.push({ validator, failureMessage });
    return this;
  }

  validateOnStart(): this {
    if (!this.isValidateOnStart) {
      this.isValidateOnStart = true;
      this.services.addTransient(STARTUP_VALIDATOR_TOKEN, (sp) => {
        return new StartupValidator(this.getName(), () => {
          this.createOptionsInstance(sp);
        });
      });
    }
    return this;
  }

  private getName(): string {
    if (typeof this.token === 'symbol') {
      return this.token.description || 'Options';
    }
    if (typeof this.token === 'function') {
      return this.token.name;
    }
    return String(this.token);
  }

  public createOptionsInstance(sp: IServiceProvider): T {
    let options: T = {} as T;

    if (typeof this.token === 'function') {
      try {
        options = new (this.token as new () => T)();
      } catch {
        options = {} as T;
      }
    }

    if (this.sectionName) {
      const config = sp.get(Configuration);
      const section = config.getSection(this.sectionName);
      options = bindOptions<T>(section, options, sp);
    }

    for (const fn of this.configureFns) {
      const result = fn(options, sp);
      if (result !== undefined && result !== null) {
        options = result;
      }
    }

    const failures: string[] = [];
    for (const { validator, failureMessage } of this.validators) {
      try {
        const result = validator(options);
        if (typeof result === 'boolean' && !result) {
          failures.push(failureMessage || 'Options validation failed');
        } else if (typeof result === 'string') {
          failures.push(result);
        }
      } catch (err: unknown) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }

    if (failures.length > 0) {
      throw new OptionsValidationError(this.getName(), failures);
    }

    return options;
  }

  private registerServices(): void {
    // 1. Direct Token: Singleton
    this.services.addSingleton(this.token as any, (sp) => {
      return this.createOptionsInstance(sp);
    });

    // 2. IOptions<T>: Singleton
    const optToken = optionsToken<T>(this.token);
    this.services.addSingleton(optToken as any, (sp) => {
      const direct = sp.get(this.token as any);
      return new OptionsWrapper(direct);
    });

    // 3. IOptionsSnapshot<T>: Scoped
    const snapToken = optionsSnapshotToken<T>(this.token);
    this.services.addScoped(snapToken as any, (sp) => {
      const fresh = this.createOptionsInstance(sp);
      return new OptionsSnapshot(fresh);
    });
  }
}
