import {
  type IServiceCollection,
  createToken,
  type ServiceToken,
} from '@tsnx/hosting-abstractions';
import { MEDIATOR, SENDER, PUBLISHER } from './tokens.js';
import type { IMediator, ISender, IPublisher } from './types.js';
import { Mediator } from './mediator.js';
import { MediatorRegistry, MediatorOptionsBuilder } from './builder.js';

export const MEDIATOR_REGISTRY_TOKEN: ServiceToken<MediatorRegistry> =
  createToken<MediatorRegistry>('MediatorRegistry');

/**
 * Registers the Mediator pattern into the TSNX dependency injection container.
 * - Handler and Behavior instances are resolved dynamically per Scoped container.
 * - Automatically registers ISender, IPublisher, and IMediator tokens.
 */
export function addMediator(
  services: IServiceCollection,
  configure?: (options: MediatorOptionsBuilder) => void,
): IServiceCollection {
  let registry: MediatorRegistry;
  const existingDesc = services.find(MEDIATOR_REGISTRY_TOKEN);

  if (existingDesc && existingDesc.instance) {
    registry = existingDesc.instance as MediatorRegistry;
  } else {
    registry = new MediatorRegistry();
    services.addSingleton(MEDIATOR_REGISTRY_TOKEN, registry);

    // Register Scoped Mediator instance
    services.addScoped<IMediator>(MEDIATOR, (sp) => {
      const reg = sp.get(MEDIATOR_REGISTRY_TOKEN);
      return new Mediator(sp, reg);
    });

    // Alias tokens
    services.addScoped<ISender>(SENDER, (sp) => sp.get(MEDIATOR));
    services.addScoped<IPublisher>(PUBLISHER, (sp) => sp.get(MEDIATOR));
  }

  if (configure) {
    const builder = new MediatorOptionsBuilder(services, registry);
    configure(builder);
  }

  return services;
}

// Module Augmentation
declare module '@tsnx/hosting-abstractions' {
  interface IServiceCollection {
    addMediator?(configure?: (options: MediatorOptionsBuilder) => void): this;
  }
}

declare module '@tsnx/hosting' {
  interface ServiceCollection {
    addMediator(configure?: (options: MediatorOptionsBuilder) => void): this;
  }
}
