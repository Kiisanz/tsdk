import * as fs from 'node:fs';
import * as path from 'node:path';
import { TsWorkspace, TsProject, ProjectGraph } from '@tsnx/core';
import { ConfigGenerator } from '@tsnx/build';

export interface SyncResult {
  scope: 'workspace' | 'standalone' | 'none';
  rootPath: string;
  projectCount: number;
  projectNames: string[];
}

export class BridgeManager {
  /**
   * Synchronizes TypeScript configurations for a workspace or project root.
   */
  static async sync(rootPath: string): Promise<SyncResult> {
    if (!fs.existsSync(rootPath)) {
      return { scope: 'none', rootPath, projectCount: 0, projectNames: [] };
    }

    // 1. Look for .tswork in rootPath
    const entries = fs.readdirSync(rootPath);
    const tsworkFile = entries.find((e) => e.endsWith('.tswork'));

    if (tsworkFile) {
      return this.syncWorkspace(rootPath, path.join(rootPath, tsworkFile));
    }

    // 2. Look for standalone .tsproj in rootPath
    const tsprojFile = entries.find((e) => e.endsWith('.tsproj'));
    if (tsprojFile) {
      return this.syncStandalone(rootPath, path.join(rootPath, tsprojFile));
    }

    return {
      scope: 'none',
      rootPath,
      projectCount: 0,
      projectNames: [],
    };
  }

  private static syncWorkspace(rootPath: string, tsworkPath: string): SyncResult {
    const workspace = TsWorkspace.loadSync(tsworkPath);
    const graph = new ProjectGraph([...workspace.projects], workspace);

    const generated = ConfigGenerator.generateWorkspaceConfigs(workspace, graph);

    // 1. Ensure .tsnx/generated exists and write configs
    if (!fs.existsSync(generated.generatedDir)) {
      fs.mkdirSync(generated.generatedDir, { recursive: true });
    }

    for (const file of generated.files) {
      fs.writeFileSync(file.filePath, file.content, 'utf8');
    }

    // 2. Write direct references root tsconfig.json for VS Code TSServer 1-level lookup
    const projectReferences = workspace.projects.map((p: TsProject) => ({
      path: `./.tsnx/generated/${p.name}.tsconfig.json`,
    }));

    const rootTsConfig = {
      files: [],
      references: projectReferences,
    };

    const rootTsConfigPath = path.join(rootPath, 'tsconfig.json');
    fs.writeFileSync(rootTsConfigPath, JSON.stringify(rootTsConfig, null, 2) + '\n', 'utf8');

    // 3. Ensure .gitignore includes tsconfig.json and .tsnx/
    this.ensureGitignore(rootPath);

    return {
      scope: 'workspace',
      rootPath,
      projectCount: workspace.projects.length,
      projectNames: workspace.projects.map((p: TsProject) => p.name),
    };
  }

  private static syncStandalone(rootPath: string, tsprojPath: string): SyncResult {
    const project = TsProject.loadSync(tsprojPath);
    const graph = new ProjectGraph([project]);

    const generated = ConfigGenerator.generateStandaloneProjectConfig(project, graph);

    if (!fs.existsSync(generated.generatedDir)) {
      fs.mkdirSync(generated.generatedDir, { recursive: true });
    }

    for (const file of generated.files) {
      fs.writeFileSync(file.filePath, file.content, 'utf8');
    }

    const rootTsConfig = {
      files: [],
      references: [{ path: `./.tsnx/generated/${project.name}.tsconfig.json` }],
    };

    const rootTsConfigPath = path.join(rootPath, 'tsconfig.json');
    fs.writeFileSync(rootTsConfigPath, JSON.stringify(rootTsConfig, null, 2) + '\n', 'utf8');

    this.ensureGitignore(rootPath);

    return {
      scope: 'standalone',
      rootPath,
      projectCount: 1,
      projectNames: [project.name],
    };
  }

  private static ensureGitignore(rootPath: string): void {
    const gitignorePath = path.join(rootPath, '.gitignore');
    const requiredEntries = ['node_modules/', 'dist/', '.tsnx/', 'tsconfig.json'];

    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }

    const missingEntries = requiredEntries.filter(
      (entry) => !content.split('\n').some((line) => line.trim() === entry.trim()),
    );

    if (missingEntries.length > 0) {
      const appended = (content.endsWith('\n') || content === '' ? '' : '\n') +
        missingEntries.join('\n') + '\n';
      fs.appendFileSync(gitignorePath, appended, 'utf8');
    }
  }
}
