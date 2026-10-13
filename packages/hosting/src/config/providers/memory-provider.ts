import { IConfigurationProvider } from '../types.js';

export class MemoryConfigurationProvider implements IConfigurationProvider {
  readonly name = 'Memory';

  constructor(private readonly data: Record<string, any> = {}) {}

  load(): Record<string, any> {
    return { ...this.data };
  }
}
