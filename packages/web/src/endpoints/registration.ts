import { ServiceCollection } from '@tsnx/hosting';
import { ENDPOINT_TOKEN, type EndpointType } from './types.js';

declare module '@tsnx/hosting-abstractions' {
  interface IServiceCollection {
    addEndpoint(endpoint: EndpointType): this;
    addEndpoints(endpoints: readonly EndpointType[]): this;
  }
}

declare module '@tsnx/hosting' {
  interface ServiceCollection {
    addEndpoint(endpoint: EndpointType): this;
    addEndpoints(endpoints: readonly EndpointType[]): this;
  }
}

if (!(ServiceCollection.prototype as any).addEndpoint) {
  (ServiceCollection.prototype as any).addEndpoint = function (
    this: ServiceCollection,
    endpoint: EndpointType,
  ): ServiceCollection {
    if (typeof endpoint === 'function' && endpoint.prototype) {
      this.addSingleton(endpoint as any).toClass(endpoint as any);
      this.add({
        token: ENDPOINT_TOKEN,
        lifetime: 'singleton',
        implementationType: endpoint as any,
      });
    } else {
      this.add({
        token: ENDPOINT_TOKEN,
        lifetime: 'singleton',
        factory: () => endpoint,
      });
    }
    return this;
  };
}

if (!(ServiceCollection.prototype as any).addEndpoints) {
  (ServiceCollection.prototype as any).addEndpoints = function (
    this: ServiceCollection,
    endpoints: readonly EndpointType[],
  ): ServiceCollection {
    for (const ep of endpoints) {
      this.addEndpoint(ep);
    }
    return this;
  };
}
