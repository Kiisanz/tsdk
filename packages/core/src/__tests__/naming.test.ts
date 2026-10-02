import * as assert from 'node:assert';
import { test, describe } from 'node:test';
import {
  validateNpmScope,
  derivePackageScope,
  derivePackageName,
  toKebabCase,
  InvalidScopeError,
} from '../naming/index.js';

describe('Naming & Scope Derivation', () => {
  test('toKebabCase converts PascalCase and dot-separated names', () => {
    assert.strictEqual(toKebabCase('ArasERP'), 'aras-erp');
    assert.strictEqual(toKebabCase('ArasERP.Domain'), 'aras-erp-domain');
    assert.strictEqual(toKebabCase('AppHost'), 'app-host');
    assert.strictEqual(toKebabCase('OrderProcessingService'), 'order-processing-service');
  });

  test('validateNpmScope validates valid and invalid scopes', () => {
    assert.strictEqual(validateNpmScope('@araserp'), true);
    assert.strictEqual(validateNpmScope('@my-org'), true);
    assert.strictEqual(validateNpmScope('@scope.sub'), true);
    assert.strictEqual(validateNpmScope('araserp'), false); // missing @
    assert.strictEqual(validateNpmScope('@ArasERP'), false); // uppercase not allowed
    assert.strictEqual(validateNpmScope('@'), false);
  });

  test('derivePackageScope derives clean lowercase scope', () => {
    assert.strictEqual(derivePackageScope('ArasERP'), '@araserp');
    assert.strictEqual(derivePackageScope('MyCompany'), '@mycompany');
    assert.strictEqual(derivePackageScope('@mycompany'), '@mycompany');
    assert.strictEqual(derivePackageScope('my-org'), '@my-org');
  });

  test('derivePackageScope throws on invalid characters', () => {
    assert.throws(() => derivePackageScope('!!!'), InvalidScopeError);
  });

  test('derivePackageName strips workspace prefix (de-stuttering)', () => {
    assert.strictEqual(
      derivePackageName('ArasERP.Domain', '@araserp', 'ArasERP'),
      '@araserp/domain',
    );
    assert.strictEqual(
      derivePackageName('ArasERP.Host', '@araserp', 'ArasERP'),
      '@araserp/host',
    );
    assert.strictEqual(
      derivePackageName('ArasERP-Infrastructure', '@araserp', 'ArasERP'),
      '@araserp/infrastructure',
    );
  });

  test('derivePackageName handles names without workspace prefix', () => {
    assert.strictEqual(
      derivePackageName('Domain', '@araserp', 'ArasERP'),
      '@araserp/domain',
    );
    assert.strictEqual(
      derivePackageName('OrderProcessing', '@araserp', 'ArasERP'),
      '@araserp/order-processing',
    );
  });

  test('derivePackageName handles unscoped names', () => {
    assert.strictEqual(derivePackageName('Domain', undefined, 'ArasERP'), 'domain');
    assert.strictEqual(derivePackageName('ArasERP.Domain', undefined, 'ArasERP'), 'domain');
  });

  test('derivePackageName preserves already scoped package names', () => {
    assert.strictEqual(
      derivePackageName('@custom/pkg', '@araserp', 'ArasERP'),
      '@custom/pkg',
    );
  });
});
