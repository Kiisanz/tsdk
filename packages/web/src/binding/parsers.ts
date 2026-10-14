export function parseIso8601Date(
  raw: unknown,
): { success: true; value: Date } | { success: false; error: string } {
  if (typeof raw !== 'string') {
    return { success: false, error: 'Expected a string formatted as ISO 8601 Date' };
  }

  const trimmed = raw.trim();
  const isoRegex = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-]\d{2}:?\d{2}))?)?$/;
  const match = isoRegex.exec(trimmed);
  if (!match) {
    return {
      success: false,
      error: 'Expected valid ISO 8601 format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)',
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { success: false, error: 'Invalid calendar date' };
  }

  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return { success: false, error: 'Invalid calendar date' };
  }

  const parsedDate = new Date(trimmed);
  if (Number.isNaN(parsedDate.getTime())) {
    return { success: false, error: 'Invalid calendar date' };
  }

  return { success: true, value: parsedDate };
}

export function parseStringNumber(
  raw: unknown,
): { success: true; value: number } | { success: false; error: string } {
  if (typeof raw === 'number') {
    if (Number.isNaN(raw) || !Number.isFinite(raw)) {
      return { success: false, error: 'Expected a finite number' };
    }
    return { success: true, value: raw };
  }

  if (typeof raw !== 'string') {
    return { success: false, error: 'Expected a numeric string' };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { success: false, error: 'Numeric string cannot be empty' };
  }

  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { success: false, error: 'Expected a valid number' };
  }

  const num = Number(trimmed);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return { success: false, error: 'Expected a valid number' };
  }

  return { success: true, value: num };
}

export function parseStringBoolean(
  raw: unknown,
): { success: true; value: boolean } | { success: false; error: string } {
  if (typeof raw === 'boolean') {
    return { success: true, value: raw };
  }

  if (typeof raw !== 'string') {
    return { success: false, error: 'Expected a boolean string' };
  }

  const lower = raw.trim().toLowerCase();
  if (lower === 'true' || lower === '1') {
    return { success: true, value: true };
  }
  if (lower === 'false' || lower === '0') {
    return { success: true, value: false };
  }

  return { success: false, error: 'Expected a boolean ("true" or "false")' };
}
