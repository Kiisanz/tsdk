import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  ServiceCollection,
  createToken,
  IServiceInstaller,
  IServiceCollection,
  IConfiguration,
  Configuration,
  MemoryConfigurationProvider,
} from '../index.js';

const GREETING_SERVICE = createToken<string>('GreetingService');
const DB_CONNECTION = createToken<string>('DbConnection');

class InventoryInstaller implements IServiceInstaller {
  install(services: IServiceCollection, configuration?: IConfiguration): void {
    const conn = configuration?.getString('Database:Connection') ?? 'default_db';
    services.addSingleton(DB_CONNECTION, conn);
    services.addSingleton(GREETING_SERVICE, 'Hello from Inventory');
  }
}

class UserModuleInstaller implements IServiceInstaller {
  install(services: IServiceCollection): void {
    services.addSingleton('USER_MODULE', true);
  }
}

describe('IServiceInstaller Pattern', () => {
  it('installs services from installer instances with configuration', () => {
    const config = new Configuration([
      new MemoryConfigurationProvider({
        'Database:Connection': 'postgres://localhost/inventory',
      }),
    ]);

    const services = new ServiceCollection();
    services.install(new InventoryInstaller(), config);

    const sp = services.buildServiceProvider();
    assert.equal(sp.get(DB_CONNECTION), 'postgres://localhost/inventory');
    assert.equal(sp.get(GREETING_SERVICE), 'Hello from Inventory');
  });

  it('installs services from an array of installer classes or instances', () => {
    const services = new ServiceCollection();
    services.install([InventoryInstaller, new UserModuleInstaller()]);

    const sp = services.buildServiceProvider();
    assert.equal(sp.get(GREETING_SERVICE), 'Hello from Inventory');
    assert.equal(sp.get(DB_CONNECTION), 'default_db');
    assert.equal(sp.get('USER_MODULE'), true);
  });
});
