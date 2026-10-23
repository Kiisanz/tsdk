import { IConfigurationProvider } from '../types.js';

export class EnvironmentVariablesConfigurationProvider implements IConfigurationProvider {
  readonly name = 'EnvironmentVariables';

  constructor(
    private readonly prefix = '',
    private readonly envSource: Record<string, string | undefined> = process.env,
  ) {}

  load(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [rawKey, value] of Object.entries(this.envSource)) {
      if (value === undefined) continue;

      let key = rawKey;
      if (this.prefix) {
        if (!key.startsWith(this.prefix)) {
          continue;
        }
        key = key.slice(this.prefix.length);
      }

      // Convert double underscores to dots: e.g. "Database__Host" -> "Database:Host" or "Database.Host"
      const normalizedKey = key.replace(/__/g, ':');
      this.setDeepValue(result, normalizedKey, value);
    }

    return result;
  }

  private setDeepValue(obj: Record<string, any>, keyPath: string, value: any): void {
    const parts = keyPath.split(/[:.]/);
    let current: any = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const nextPart = parts[i + 1];
      const wantsArray = /^\d+$/.test(nextPart);
      if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part]) !== wantsArray) {
        current[part] = wantsArray ? [] : {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    if (Array.isArray(current) && /^\d+$/.test(lastPart)) {
      current[Number(lastPart)] = value;
    } else {
      current[lastPart] = value;
    }
  }
}
