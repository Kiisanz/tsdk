import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProjectYaml } from './parser.js';
import { ProjectReference, ProjectType, TsProjectManifest } from './types.js';
import { isNativeProject, loadNativeProjectSync } from './native.js';

export class TsProject {
  public readonly filePath: string;
  public readonly directory: string;
  public readonly manifest: TsProjectManifest;

  constructor(filePath: string, manifest: TsProjectManifest) {
    this.filePath = path.resolve(filePath);
    this.directory = path.dirname(this.filePath);
    this.manifest = manifest;
  }

  get name(): string {
    return this.manifest.metadata.name;
  }

  get version(): string {
    return this.manifest.metadata.version ?? '0.1.0';
  }

  get type(): ProjectType {
    return this.manifest.spec.type;
  }

  get runtime(): string {
    return this.manifest.spec.runtime ?? 'node';
  }

  get references(): readonly ProjectReference[] {
    return this.manifest.spec.references ?? [];
  }

  static loadSync(filePath: string): TsProject {
    const resolvedPath = path.resolve(filePath);
    if (isNativeProject(resolvedPath)) {
      return loadNativeProjectSync(resolvedPath);
    }
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const manifest = parseProjectYaml(content, resolvedPath);
    return new TsProject(resolvedPath, manifest);
  }

  static async load(filePath: string): Promise<TsProject> {
    const resolvedPath = path.resolve(filePath);
    const content = await fs.promises.readFile(resolvedPath, 'utf-8');
    const manifest = parseProjectYaml(content, resolvedPath);
    return new TsProject(resolvedPath, manifest);
  }
}
