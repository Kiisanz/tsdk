import { IConfiguration, IConfigurationSection } from '../config/types.js';

export function bindOptions<T>(
  sectionOrConfig: IConfigurationSection | IConfiguration,
  targetOrFactory?: (new () => T) | T | ((sp: any) => T),
  sp?: any,
): T {
  const rawData = sectionOrConfig.getAll();
  let instance: any = {};

  if (typeof targetOrFactory === 'function') {
    try {
      instance = new (targetOrFactory as new () => T)();
    } catch {
      instance = (targetOrFactory as Function)(sp);
    }
  } else if (targetOrFactory && typeof targetOrFactory === 'object') {
    instance = { ...targetOrFactory };
  }

  for (const [key, value] of Object.entries(rawData)) {
    // Determine the matching property name on instance
    let targetKey = key;

    // 1. Exact match on instance
    if (key in instance) {
      targetKey = key;
    } else {
      // 2. Case-insensitive lookup on instance
      let found = false;
      for (const prop of Object.keys(instance)) {
        if (prop.toLowerCase() === key.toLowerCase()) {
          targetKey = prop;
          found = true;
          break;
        }
      }

      // 3. If not found, use camelCase (e.g. ConnectionString -> connectionString)
      if (!found) {
        const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
        targetKey = camelKey;
      }
    }

    const existingVal = instance[targetKey];
    instance[targetKey] = coerceValue(value, existingVal);
  }

  return instance as T;
}

function coerceValue(val: any, existingVal?: any): any {
  if (val === null || val === undefined) {
    return val;
  }

  // If existing default value provides a type hint
  if (existingVal !== undefined) {
    if (typeof existingVal === 'number') {
      const num = Number(val);
      return !Number.isNaN(num) ? num : existingVal;
    }
    if (typeof existingVal === 'boolean') {
      if (typeof val === 'boolean') return val;
      const str = String(val).trim().toLowerCase();
      return str === 'true' || str === '1';
    }
    if (typeof existingVal === 'string') {
      return String(val);
    }
  }

  // Automatic coercion for string primitives
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      if (trimmed === '0' || !/^0\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        if (!Number.isNaN(num)) return num;
      }
    }
  }

  return val;
}
