import { ServiceIdentifier } from './types.js';

function formatToken(token: ServiceIdentifier): string {
  if (typeof token === 'function') {
    return token.name || 'AnonymousClass';
  }
  return String(token);
}

export class ServiceNotFoundError extends Error {
  constructor(token: ServiceIdentifier, consumerToken?: ServiceIdentifier) {
    const context = consumerToken ? ` required by "${formatToken(consumerToken)}"` : '';
    super(`No service registered for token "${formatToken(token)}"${context}.`);
    this.name = 'ServiceNotFoundError';
  }
}

export class CaptiveDependencyError extends Error {
  constructor(scopedToken: ServiceIdentifier, consumerToken?: ServiceIdentifier) {
    const consumer = consumerToken ? ` by "${formatToken(consumerToken)}"` : ' from the root container';
    super(
      `Cannot resolve scoped service "${formatToken(scopedToken)}"${consumer}. Scoped services can only be resolved within an active scope (via provider.createScope()).`,
    );
    this.name = 'CaptiveDependencyError';
  }
}

export class CircularDependencyError extends Error {
  constructor(chain: ServiceIdentifier[]) {
    const formatted = chain.map(formatToken).join(' -> ');
    super(`Circular dependency detected: ${formatted}.`);
    this.name = 'CircularDependencyError';
  }
}

export class ObjectDisposedError extends Error {
  constructor(objectName: string) {
    super(`Cannot access disposed object "${objectName}".`);
    this.name = 'ObjectDisposedError';
  }
}
