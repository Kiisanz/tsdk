import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export class WorkspaceManager {
  static initWorkspace(name: string, targetDir = process.cwd()): string {
    const tswFilePath = path.join(targetDir, `${name}.tswork`);

    if (fs.existsSync(tswFilePath)) {
      throw new Error(`Workspace manifest "${tswFilePath}" already exists.`);
    }

    const tswContent = `schemaVersion: 1
kind: Workspace

metadata:
  name: ${name}

projects: []

defaults:
  runtime: node
  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`;
    fs.writeFileSync(tswFilePath, tswContent, 'utf-8');

    // Create pnpm-workspace.yaml if not present
    const pnpmWsPath = path.join(targetDir, 'pnpm-workspace.yaml');
    if (!fs.existsSync(pnpmWsPath)) {
      const pnpmWsContent = `packages:
  - 'apps/*'
  - 'packages/*'
`;
      fs.writeFileSync(pnpmWsPath, pnpmWsContent, 'utf-8');
    }

    return tswFilePath;
  }

  static addProjectToWorkspace(tswFilePath: string, projectFilePath: string): string {
    if (!fs.existsSync(tswFilePath)) {
      throw new Error(`Workspace file "${tswFilePath}" not found.`);
    }

    let resolvedProjectPath = path.resolve(projectFilePath);
    if (fs.existsSync(resolvedProjectPath) && fs.statSync(resolvedProjectPath).isDirectory()) {
      // Find .tsproj in directory
      const files = fs.readdirSync(resolvedProjectPath);
      const tsp = files.find((f) => f.endsWith('.tsproj'));
      if (!tsp) {
        throw new Error(`No .tsproj manifest found in directory "${resolvedProjectPath}".`);
      }
      resolvedProjectPath = path.join(resolvedProjectPath, tsp);
    }

    if (!fs.existsSync(resolvedProjectPath) || !resolvedProjectPath.endsWith('.tsproj')) {
      throw new Error(`Project manifest "${resolvedProjectPath}" not found.`);
    }

    const tswDir = path.dirname(tswFilePath);
    const relProjectPath = path.relative(tswDir, resolvedProjectPath).replace(/\\/g, '/');

    const content = fs.readFileSync(tswFilePath, 'utf-8');
    const doc = parseYaml(content) as Record<string, any>;

    if (!doc.projects || !Array.isArray(doc.projects)) {
      doc.projects = [];
    }

    // Check if already registered
    const exists = doc.projects.some(
      (p: any) => p.path && p.path.replace(/\\/g, '/') === relProjectPath,
    );

    if (exists) {
      return relProjectPath;
    }

    doc.projects.push({ path: relProjectPath });

    fs.writeFileSync(tswFilePath, stringifyYaml(doc), 'utf-8');
    return relProjectPath;
  }
}
