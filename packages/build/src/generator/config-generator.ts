import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { ProjectGraph, TsProject, TsWorkspace } from '@tsnx/core';
import {
  GeneratedConfigFile,
  GeneratedConfigResult,
  TsConfigOptions,
  TsConfigReference,
  TsConfigSchema,
} from './types.js';

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

export function relPosix(
  from: string,
  to: string,
  pathModule: { relative: (from: string, to: string) => string } = path,
): string {
  const rel = pathModule.relative(from, to);
  const posixRel = toPosix(rel);
  if (posixRel.startsWith('.')) {
    return posixRel;
  }
  return `./${posixRel}`;
}

export class ConfigGenerator {
  static getFallbackTypeRoots(): string[] {
    try {
      const req = createRequire(import.meta.url);
      const pkgPath = req.resolve('@types/node/package.json');
      const typesDir = path.dirname(path.dirname(pkgPath));
      if (fs.existsSync(typesDir)) {
        return [typesDir];
      }
    } catch {
      // Fallback not available
    }
    return [];
  }

  static generateWorkspaceConfigs(
    workspace: TsWorkspace,
    graph: ProjectGraph,
  ): GeneratedConfigResult {
    const generatedDir = path.resolve(workspace.directory, '.tsnx', 'generated');
    const files: GeneratedConfigFile[] = [];

    const rootReferences: TsConfigReference[] = [];

    // 1. Generate individual project tsconfig files
    for (const project of workspace.projects) {
      const configFileName = `${project.name}.tsconfig.json`;
      const projectConfigPath = path.join(generatedDir, configFileName);

      rootReferences.push({ path: `./${configFileName}` });

      const node = graph.getNode(project.name);
      const dependencies = node ? node.dependencies : [];

      const projectReferences: TsConfigReference[] = dependencies.map((dep) => ({
        path: `./${dep.name}.tsconfig.json`,
      }));

      const sourceRoot = project.manifest.spec.source?.root ?? 'src';
      const absSourceRoot = path.resolve(project.directory, sourceRoot);
      const absOutDir = path.resolve(project.directory, 'dist');
      const absBuildInfo = path.resolve(project.directory, 'dist', '.tsbuildinfo');

      const customCompiler = project.manifest.spec.compiler ?? {};

      const candidateTypeRoots: string[] = [];
      const projectTypes = path.resolve(project.directory, 'node_modules', '@types');
      candidateTypeRoots.push(relPosix(generatedDir, projectTypes));

      const wsTypes = path.resolve(workspace.directory, 'node_modules', '@types');
      if (wsTypes !== projectTypes) {
        candidateTypeRoots.push(relPosix(generatedDir, wsTypes));
      }

      for (const fb of ConfigGenerator.getFallbackTypeRoots()) {
        const posixFb = toPosix(fb);
        if (!candidateTypeRoots.includes(posixFb)) {
          candidateTypeRoots.push(posixFb);
        }
      }

      const compilerOptions: TsConfigOptions = {
        composite: true,
        target: (customCompiler.target as string) ?? 'ES2022',
        module: (customCompiler.module as string) ?? 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: customCompiler.strict !== undefined ? Boolean(customCompiler.strict) : true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        skipLibCheck: true,
        esModuleInterop: true,
        rootDir: relPosix(generatedDir, absSourceRoot),
        outDir: relPosix(generatedDir, absOutDir),
        tsBuildInfoFile: relPosix(generatedDir, absBuildInfo),
        typeRoots: candidateTypeRoots,
        ...customCompiler,
      };

      const projectConfig: TsConfigSchema = {
        compilerOptions,
        include: [`${relPosix(generatedDir, absSourceRoot)}/**/*`],
        ...(projectReferences.length > 0 ? { references: projectReferences } : {}),
      };

      files.push({
        filePath: projectConfigPath,
        content: JSON.stringify(projectConfig, null, 2),
      });
    }

    // 2. Generate root solution tsconfig.json
    const rootConfigPath = path.join(generatedDir, 'tsconfig.json');
    const rootConfig: TsConfigSchema = {
      files: [],
      references: rootReferences,
    };

    files.push({
      filePath: rootConfigPath,
      content: JSON.stringify(rootConfig, null, 2),
    });

    return {
      generatedDir,
      rootConfigPath,
      files,
      scope: 'workspace',
      knownProjectNames: workspace.projects.map((p) => p.name.toLowerCase()),
    };
  }

  static generateStandaloneProjectConfig(
    project: TsProject,
    graph: ProjectGraph,
  ): GeneratedConfigResult {
    const generatedDir = path.resolve(project.directory, '.tsnx', 'generated');
    const files: GeneratedConfigFile[] = [];

    const node = graph.getNode(project.name);
    const dependencies = node ? node.dependencies : [];

    // For any standalone dependencies, generate their configs in generatedDir as well
    for (const dep of dependencies) {
      const depConfigFileName = `${dep.name}.tsconfig.json`;
      const depConfigPath = path.join(generatedDir, depConfigFileName);
      const depSourceRoot = dep.manifest.spec.source?.root ?? 'src';
      const absDepSourceRoot = path.resolve(dep.directory, depSourceRoot);
      const absDepOutDir = path.resolve(dep.directory, 'dist');
      const absDepBuildInfo = path.resolve(dep.directory, 'dist', '.tsbuildinfo');
      const depCompiler = dep.manifest.spec.compiler ?? {};

      const depTypes = path.resolve(dep.directory, 'node_modules', '@types');
      const depCandidateTypeRoots = [
        relPosix(generatedDir, depTypes),
        ...ConfigGenerator.getFallbackTypeRoots().map(toPosix),
      ];

      const depConfig: TsConfigSchema = {
        compilerOptions: {
          composite: true,
          target: (depCompiler.target as string) ?? 'ES2022',
          module: (depCompiler.module as string) ?? 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: depCompiler.strict !== undefined ? Boolean(depCompiler.strict) : true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          skipLibCheck: true,
          esModuleInterop: true,
          rootDir: relPosix(generatedDir, absDepSourceRoot),
          outDir: relPosix(generatedDir, absDepOutDir),
          tsBuildInfoFile: relPosix(generatedDir, absDepBuildInfo),
          typeRoots: depCandidateTypeRoots,
          ...depCompiler,
        },
        include: [`${relPosix(generatedDir, absDepSourceRoot)}/**/*`],
      };

      files.push({
        filePath: depConfigPath,
        content: JSON.stringify(depConfig, null, 2),
      });
    }

    const sourceRoot = project.manifest.spec.source?.root ?? 'src';
    const absSourceRoot = path.resolve(project.directory, sourceRoot);
    const absOutDir = path.resolve(project.directory, 'dist');
    const absBuildInfo = path.resolve(project.directory, 'dist', '.tsbuildinfo');
    const customCompiler = project.manifest.spec.compiler ?? {};

    const candidateTypeRoots: string[] = [];
    const projectTypes = path.resolve(project.directory, 'node_modules', '@types');
    candidateTypeRoots.push(relPosix(generatedDir, projectTypes));

    for (const fb of ConfigGenerator.getFallbackTypeRoots()) {
      const posixFb = toPosix(fb);
      if (!candidateTypeRoots.includes(posixFb)) {
        candidateTypeRoots.push(posixFb);
      }
    }

    const projectReferences: TsConfigReference[] = dependencies.map((dep) => ({
      path: `./${dep.name}.tsconfig.json`,
    }));

    const rootConfigPath = path.join(generatedDir, 'tsconfig.json');
    const projectConfig: TsConfigSchema = {
      compilerOptions: {
        composite: true,
        target: (customCompiler.target as string) ?? 'ES2022',
        module: (customCompiler.module as string) ?? 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: customCompiler.strict !== undefined ? Boolean(customCompiler.strict) : true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        skipLibCheck: true,
        esModuleInterop: true,
        rootDir: relPosix(generatedDir, absSourceRoot),
        outDir: relPosix(generatedDir, absOutDir),
        tsBuildInfoFile: relPosix(generatedDir, absBuildInfo),
        typeRoots: candidateTypeRoots,
        ...customCompiler,
      },
      include: [`${relPosix(generatedDir, absSourceRoot)}/**/*`],
      ...(projectReferences.length > 0 ? { references: projectReferences } : {}),
    };

    files.push({
      filePath: rootConfigPath,
      content: JSON.stringify(projectConfig, null, 2),
    });

    return {
      generatedDir,
      rootConfigPath,
      files,
      scope: 'project',
      knownProjectNames: [project.name.toLowerCase()],
    };
  }

  static writeGeneratedConfigsSync(result: GeneratedConfigResult): void {
    fs.mkdirSync(result.generatedDir, { recursive: true });

    // Prune stale generated tsconfig files ONLY when running in workspace scope
    if (result.scope === 'workspace' && result.knownProjectNames) {
      const activePaths = new Set(result.files.map((f) => path.resolve(f.filePath)));
      const knownNames = new Set(result.knownProjectNames.map((n) => n.toLowerCase()));

      try {
        const existing = fs.readdirSync(result.generatedDir);
        for (const item of existing) {
          if (item.endsWith('.tsconfig.json')) {
            const full = path.resolve(result.generatedDir, item);
            if (!activePaths.has(full)) {
              const projName = item.slice(0, -'.tsconfig.json'.length).toLowerCase();
              if (!knownNames.has(projName)) {
                fs.rmSync(full, { force: true });
              }
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    for (const file of result.files) {
      fs.mkdirSync(path.dirname(file.filePath), { recursive: true });
      fs.writeFileSync(file.filePath, file.content, 'utf-8');
    }
  }

  static async writeGeneratedConfigs(result: GeneratedConfigResult): Promise<void> {
    await fs.promises.mkdir(result.generatedDir, { recursive: true });

    // Prune stale generated tsconfig files ONLY when running in workspace scope
    if (result.scope === 'workspace' && result.knownProjectNames) {
      const activePaths = new Set(result.files.map((f) => path.resolve(f.filePath)));
      const knownNames = new Set(result.knownProjectNames.map((n) => n.toLowerCase()));

      try {
        const existing = await fs.promises.readdir(result.generatedDir);
        for (const item of existing) {
          if (item.endsWith('.tsconfig.json')) {
            const full = path.resolve(result.generatedDir, item);
            if (!activePaths.has(full)) {
              const projName = item.slice(0, -'.tsconfig.json'.length).toLowerCase();
              if (!knownNames.has(projName)) {
                await fs.promises.rm(full, { force: true });
              }
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    for (const file of result.files) {
      await fs.promises.mkdir(path.dirname(file.filePath), { recursive: true });
      await fs.promises.writeFile(file.filePath, file.content, 'utf-8');
    }
  }
}
