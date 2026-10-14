/**
 * Regex for validating standard npm package scope.
 * Must start with @, followed by lowercase alphanumeric, dots, underscores, or hyphens.
 */
export const NPM_SCOPE_REGEX = /^@[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

export class InvalidScopeError extends Error {
  constructor(public readonly scope: string, message?: string) {
    super(message ?? `Invalid npm package scope "${scope}". Must match format: @scope (lowercase alphanumeric and hyphens).`);
    this.name = 'InvalidScopeError';
  }
}

/**
 * Validates whether a scope string complies with npm rules.
 */
export function validateNpmScope(scope: string): boolean {
  return NPM_SCOPE_REGEX.test(scope);
}

/**
 * Converts a camelCase, PascalCase, or dot.separated string into kebab-case.
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

/**
 * Derives a valid npm package scope from a workspace name.
 * e.g. "ArasERP" -> "@araserp"
 *      "@aras" -> "@aras"
 */
export function derivePackageScope(workspaceName: string): string {
  let cleaned = workspaceName.trim();
  if (cleaned.startsWith('@')) {
    cleaned = cleaned.substring(1);
  }
  const normalized = cleaned
    .replace(/[\s.]+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();

  const scope = `@${normalized}`;
  if (!validateNpmScope(scope)) {
    throw new InvalidScopeError(scope);
  }
  return scope;
}

/**
 * Derives a clean npm package name for a project, stripping repetitive workspace prefixes.
 * e.g. projectName: "ArasERP.Domain", workspaceName: "ArasERP", scope: "@araserp"
 *      -> "@araserp/domain"
 */
export function derivePackageName(
  projectName: string,
  scope?: string,
  workspaceName?: string,
): string {
  const trimmed = projectName.trim();
  if (trimmed.startsWith('@')) {
    // Already an explicit scoped name
    return trimmed;
  }

  let baseName = trimmed;

  // De-stuttering: remove workspace prefix if present
  if (workspaceName) {
    const wsTrimmed = workspaceName.trim().replace(/^@/, '');
    const wsPrefixes = [
      `${wsTrimmed}.`,
      `${wsTrimmed}-`,
      `${toKebabCase(wsTrimmed)}.`,
      `${toKebabCase(wsTrimmed)}-`,
    ];

    for (const prefix of wsPrefixes) {
      if (baseName.toLowerCase().startsWith(prefix.toLowerCase())) {
        baseName = baseName.substring(prefix.length);
        break;
      }
    }
  }

  const slug = toKebabCase(baseName);

  if (scope) {
    const normalizedScope = scope.startsWith('@') ? scope : `@${scope}`;
    return `${normalizedScope}/${slug}`;
  }

  return slug;
}
