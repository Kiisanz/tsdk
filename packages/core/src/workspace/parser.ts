import { parse as parseYaml } from 'yaml';
import { TsWorkspaceManifest, WorkspaceProjectEntry } from './types.js';

export class WorkspaceValidationError extends Error {
  constructor(message: string, public readonly filePath?: string) {
    super(filePath ? `[${filePath}] ${message}` : message);
    this.name = 'WorkspaceValidationError';
  }
}

export function parseWorkspaceYaml(content: string, filePath?: string): TsWorkspaceManifest {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new WorkspaceValidationError(`Failed to parse YAML: ${errorMsg}`, filePath);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WorkspaceValidationError('Root of .tswork file must be a YAML mapping/object', filePath);
  }

  const raw = parsed as Record<string, unknown>;

  // schemaVersion
  if (raw['schemaVersion'] !== 1) {
    throw new WorkspaceValidationError(
      `Invalid schemaVersion: expected 1, received ${JSON.stringify(raw['schemaVersion'])}`,
      filePath,
    );
  }

  // kind
  if (raw['kind'] !== 'Workspace') {
    throw new WorkspaceValidationError(
      `Invalid kind: expected "Workspace", received ${JSON.stringify(raw['kind'])}`,
      filePath,
    );
  }

  // metadata
  if (!raw['metadata'] || typeof raw['metadata'] !== 'object' || Array.isArray(raw['metadata'])) {
    throw new WorkspaceValidationError('Field "metadata" is required and must be an object', filePath);
  }

  const metadata = raw['metadata'] as Record<string, unknown>;
  if (typeof metadata['name'] !== 'string' || metadata['name'].trim() === '') {
    throw new WorkspaceValidationError('Field "metadata.name" is required and must be a non-empty string', filePath);
  }

  const workspaceName = metadata['name'].trim();

  // projects
  if (!Array.isArray(raw['projects'])) {
    throw new WorkspaceValidationError('Field "projects" is required and must be an array of { path: string }', filePath);
  }

  const projectEntries: WorkspaceProjectEntry[] = [];
  const seenPaths = new Set<string>();

  for (let i = 0; i < raw['projects'].length; i++) {
    const entry = raw['projects'][i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new WorkspaceValidationError(
        `Invalid project entry at index ${i}: expected object with { path: string }`,
        filePath,
      );
    }

    const entryObj = entry as Record<string, unknown>;
    if (typeof entryObj['path'] !== 'string' || entryObj['path'].trim() === '') {
      throw new WorkspaceValidationError(
        `Invalid project entry at index ${i}: "path" must be a non-empty string`,
        filePath,
      );
    }

    const relPath = entryObj['path'].trim();
    const normalizedPath = relPath.replace(/\\/g, '/');

    if (seenPaths.has(normalizedPath)) {
      throw new WorkspaceValidationError(
        `Duplicate project path "${relPath}" in workspace "${workspaceName}"`,
        filePath,
      );
    }
    seenPaths.add(normalizedPath);

    projectEntries.push({ path: relPath });
  }

  // defaults
  const defaults =
    raw['defaults'] && typeof raw['defaults'] === 'object' && !Array.isArray(raw['defaults'])
      ? (raw['defaults'] as Record<string, unknown>)
      : undefined;

  return {
    schemaVersion: 1,
    kind: 'Workspace',
    metadata: {
      name: workspaceName,
    },
    projects: projectEntries,
    ...(defaults ? { defaults: defaults as TsWorkspaceManifest['defaults'] } : {}),
  };
}
