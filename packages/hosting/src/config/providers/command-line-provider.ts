import { IConfigurationProvider } from '../types.js';

export class CommandLineConfigurationProvider implements IConfigurationProvider {
  readonly name = 'CommandLine';

  constructor(private readonly args: string[] = []) {}

  load(): Record<string, any> {
    const result: Record<string, any> = {};

    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];
      if (!arg.startsWith('--')) {
        continue;
      }

      const stripped = arg.slice(2);
      const equalIndex = stripped.indexOf('=');

      if (equalIndex !== -1) {
        const key = stripped.slice(0, equalIndex);
        const value = stripped.slice(equalIndex + 1);
        this.setDeepValue(result, key, value);
      } else {
        const nextArg = this.args[i + 1];
        if (nextArg !== undefined && !nextArg.startsWith('--')) {
          this.setDeepValue(result, stripped, nextArg);
          i++;
        } else {
          this.setDeepValue(result, stripped, 'true');
        }
      }
    }

    return result;
  }

  private setDeepValue(obj: Record<string, any>, keyPath: string, value: any): void {
    const parts = keyPath.split(/[:.]/);
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }
}
