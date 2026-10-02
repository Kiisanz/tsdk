import { parse as parseYaml } from 'yaml';
import { ProjectReference, ProjectType, TsProjectManifest } from './types.js';

export class ProjectValidationError extends Error {
  public readonly code: string;
  constructor(message: string, public readonly filePath?: string, code = 'TSNX1001') {
    super(filePath ? `${filePath} error ${code}: ${message}` : `error ${code}: ${message}`);
    this.name = 'ProjectValidationError';
    this.code = code;
  }
}

const VALID_PROJECT_TYPES: readonly ProjectType[] = [
  'console',
  'library',
  'webapi',
  'worker',
  'test',
];

export function parseProjectYaml(content: string, filePath?: string): TsProjectManifest {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new ProjectValidationError(`Failed to parse YAML: ${errorMsg}`, filePath);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProjectValidationError('Root of .tsproj file must be a YAML mapping/object', filePath);
  }

  const raw = parsed as Record<string, unknown>;

  // schemaVersion
  if (raw['schemaVersion'] !== 1) {
    throw new ProjectValidationError(
      `Invalid schemaVersion: expected 1, received ${JSON.stringify(raw['schemaVersion'])}`,
      filePath,
    );
  }

  // kind
  if (raw['kind'] !== 'Project') {
    throw new ProjectValidationError(
      `Invalid kind: expected "Project", received ${JSON.stringify(raw['kind'])}`,
      filePath,
    );
  }

  // metadata
  if (!raw['metadata'] || typeof raw['metadata'] !== 'object' || Array.isArray(raw['metadata'])) {
    throw new ProjectValidationError('Field "metadata" is required and must be an object', filePath);
  }

  const metadata = raw['metadata'] as Record<string, unknown>;
  if (typeof metadata['name'] !== 'string' || metadata['name'].trim() === '') {
    throw new ProjectValidationError('Field "metadata.name" is required and must be a non-empty string', filePath);
  }

  const projectName = metadata['name'].trim();
  const projectVersion =
    typeof metadata['version'] === 'string' && metadata['version'].trim() !== ''
      ? metadata['version'].trim()
      : '0.1.0';

  // spec
  if (!raw['spec'] || typeof raw['spec'] !== 'object' || Array.isArray(raw['spec'])) {
    throw new ProjectValidationError('Field "spec" is required and must be an object', filePath);
  }

  const spec = raw['spec'] as Record<string, unknown>;

  if (typeof spec['type'] !== 'string' || !VALID_PROJECT_TYPES.includes(spec['type'] as ProjectType)) {
    throw new ProjectValidationError(
      `Field "spec.type" is required and must be one of: ${VALID_PROJECT_TYPES.join(', ')}`,
      filePath,
    );
  }

  const parsedReferences: ProjectReference[] = [];
  if (spec['references'] !== undefined) {
    if (!Array.isArray(spec['references'])) {
      throw new ProjectValidationError('Field "spec.references" must be an array of objects', filePath);
    }

    const seenRefNames = new Set<string>();

    for (let i = 0; i < spec['references'].length; i++) {
      const ref = spec['references'][i];
      if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
        throw new ProjectValidationError(
          `Invalid reference at index ${i}: expected object with { project: string }`,
          filePath,
        );
      }

      const refObj = ref as Record<string, unknown>;
      if (typeof refObj['project'] !== 'string' || refObj['project'].trim() === '') {
        throw new ProjectValidationError(
          `Invalid reference at index ${i}: "project" must be a non-empty string`,
          filePath,
        );
      }

      const targetName = refObj['project'].trim();

      // Rule: self-reference rejected (case-insensitive)
      if (targetName.toLowerCase() === projectName.toLowerCase()) {
        throw new ProjectValidationError(
          `Project "${projectName}" cannot reference itself`,
          filePath,
        );
      }

      // Rule: duplicate references rejected (case-insensitive)
      const targetNameKey = targetName.toLowerCase();
      if (seenRefNames.has(targetNameKey)) {
        throw new ProjectValidationError(
          `Duplicate reference to project "${targetName}" in project "${projectName}"`,
          filePath,
        );
      }
      seenRefNames.add(targetNameKey);

      if (refObj['path'] !== undefined && typeof refObj['path'] !== 'string') {
        throw new ProjectValidationError(
          `Invalid reference at index ${i}: "path" must be a string`,
          filePath,
        );
      }

      parsedReferences.push({
        project: targetName,
        ...(typeof refObj['path'] === 'string' ? { path: refObj['path'].trim() } : {}),
      });
    }
  }

  return {
    schemaVersion: 1,
    kind: 'Project',
    metadata: {
      name: projectName,
      version: projectVersion,
    },
    spec: {
      type: spec['type'] as ProjectType,
      runtime: typeof spec['runtime'] === 'string' ? spec['runtime'].trim() : 'node',
      ...(spec['package'] && typeof spec['package'] === 'object' && !Array.isArray(spec['package'])
        ? { package: spec['package'] as Record<string, unknown> }
        : {}),
      ...(spec['source'] && typeof spec['source'] === 'object' && !Array.isArray(spec['source'])
        ? { source: spec['source'] as Record<string, unknown> }
        : {}),
      ...(spec['compiler'] && typeof spec['compiler'] === 'object' && !Array.isArray(spec['compiler'])
        ? { compiler: spec['compiler'] as Record<string, unknown> }
        : {}),
      references: parsedReferences,
    },
  };
}
