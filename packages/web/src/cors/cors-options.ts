import { createToken, ServiceCollection } from '@tsnx/hosting';
import { CorsPolicy } from './types.js';
import { CorsPolicyBuilder } from './cors-policy-builder.js';

export const DEFAULT_CORS_POLICY_NAME = '__DefaultCorsPolicy';

export class CorsOptions {
  private readonly policies = new Map<string, CorsPolicy>();

  public addDefaultPolicy(configure: (builder: CorsPolicyBuilder) => void): this {
    const builder = new CorsPolicyBuilder();
    configure(builder);
    const policy = builder.build();
    policy.name = DEFAULT_CORS_POLICY_NAME;
    this.policies.set(DEFAULT_CORS_POLICY_NAME, policy);
    return this;
  }

  public addPolicy(name: string, configureOrPolicy: ((builder: CorsPolicyBuilder) => void) | CorsPolicy): this {
    if (typeof configureOrPolicy === 'function') {
      const builder = new CorsPolicyBuilder();
      configureOrPolicy(builder);
      const policy = builder.build();
      policy.name = name;
      this.policies.set(name, policy);
    } else {
      this.policies.set(name, { ...configureOrPolicy, name });
    }
    return this;
  }

  public getPolicy(name?: string): CorsPolicy | undefined {
    return this.policies.get(name ?? DEFAULT_CORS_POLICY_NAME);
  }
}

export const CORS_OPTIONS = createToken<CorsOptions>('CorsOptions');

declare module '@tsnx/hosting' {
  interface ServiceCollection {
    addCors(configure?: (options: CorsOptions) => void): this;
  }
}

if (!(ServiceCollection.prototype as any).addCors) {
  (ServiceCollection.prototype as any).addCors = function (
    this: ServiceCollection,
    configure?: (options: CorsOptions) => void
  ): ServiceCollection {
    const options = new CorsOptions();
    if (configure) {
      configure(options);
    }
    this.addSingleton(CORS_OPTIONS, options);
    return this;
  };
}
