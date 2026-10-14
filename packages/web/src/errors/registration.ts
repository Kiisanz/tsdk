import { ServiceCollection, IServiceProvider, Constructor } from '@tsnx/hosting';
import { IExceptionHandler, EXCEPTION_HANDLER_TOKEN } from './types.js';

declare module '@tsnx/hosting' {
  interface ServiceCollection {
    addExceptionHandler<T extends IExceptionHandler>(
      handler: Constructor<T> | ((sp: IServiceProvider) => T),
      ...dependencies: any[]
    ): this;
  }
}

function isConstructor(fn: any): fn is Constructor<any> {
  if (typeof fn !== 'function') return false;
  if (!fn.prototype) return false;
  if (typeof fn.prototype.tryHandleAsync === 'function') return true;
  const descriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
  return !descriptor?.writable;
}

if (!(ServiceCollection.prototype as any).addExceptionHandler) {
  (ServiceCollection.prototype as any).addExceptionHandler = function <T extends IExceptionHandler>(
    this: ServiceCollection,
    handler: Constructor<T> | ((sp: IServiceProvider) => T),
    ...dependencies: any[]
  ): ServiceCollection {
    if (isConstructor(handler)) {
      if (dependencies.length > 0) {
        (this.addScoped(handler as any) as any).toClass(handler, ...dependencies);
      } else {
        this.addScoped(handler as any).toClass(handler as any);
      }
      this.add({
        token: EXCEPTION_HANDLER_TOKEN,
        lifetime: 'scoped',
        implementationType: handler,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
      });
    } else {
      const handlerToken = Symbol('tsnx.exception_handler.factory');
      (this.addScoped(handlerToken as any) as any).toFactory(handler);
      this.add({
        token: EXCEPTION_HANDLER_TOKEN,
        lifetime: 'scoped',
        implementationType: handlerToken as any,
        factory: handler as any,
      });
    }
    return this;
  };
}
