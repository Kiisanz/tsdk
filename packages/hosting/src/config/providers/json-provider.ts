import * as fs from 'node:fs';
import * as path from 'node:path';
import { IConfigurationProvider } from '../types.js';

export class JsonConfigurationProvider implements IConfigurationProvider {
  readonly name: string;

  constructor(
    public readonly filePath: string,
    public readonly optional = true,
  ) {
    this.name = `JsonFile(${path.basename(filePath)})`;
  }

  load(): Record<string, any> {
    const resolvedPath = path.resolve(this.filePath);
    if (!fs.existsSync(resolvedPath)) {
      if (this.optional) {
        return {};
      }
      throw new Error(`Configuration file "${resolvedPath}" not found.`);
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const parsed = JSON.parse(content);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (err: unknown) {
      throw new Error(`Failed to parse configuration file "${resolvedPath}": ${err instanceof Error ? err.message : err}`);
    }
  }
}
