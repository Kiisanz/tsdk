import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { ProjectGraph, TsProject, TsWorkspace } from '@tsnx/core';
import { ConfigGenerator } from '../generator/config-generator.js';
import { BuildOptions, BuildResult } from './types.js';

export class BuildError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly output: string,
  ) {
    super(message);
    this.name = 'BuildError';
  }
}

export class BuildOrchestrator {
  private static findTscPath(): string {
    const req = createRequire(import.meta.url);
    try {
      return req.resolve('typescript/bin/tsc');
    } catch {
      throw new Error('TypeScript compiler binary (typescript/bin/tsc) not found in dependencies');
    }
  }

  static async buildWorkspace(
    workspace: TsWorkspace,
    graph: ProjectGraph,
    options: BuildOptions = {},
  ): Promise<BuildResult> {
    const startTime = Date.now();

    // 1. Generate tsconfig files in .tsdk/generated/
    const generatedConfig = ConfigGenerator.generateWorkspaceConfigs(workspace, graph);
    await ConfigGenerator.writeGeneratedConfigs(generatedConfig);

    // 2. Prepare arguments for tsc
    const args: string[] = ['--build', generatedConfig.rootConfigPath];

    if (options.clean) {
      args.push('--clean');
    } else if (options.rebuild) {
      args.push('--force');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    // 3. Execute tsc
    const execResult = await this.executeTsc(args, workspace.directory);
    const durationMs = Date.now() - startTime;

    const result: BuildResult = {
      success: execResult.exitCode === 0,
      exitCode: execResult.exitCode,
      output: execResult.output,
      durationMs,
      generatedConfig,
    };

    if (!result.success) {
      throw new BuildError(
        `Compilation failed with exit code ${result.exitCode}:\n${result.output}`,
        result.exitCode,
        result.output,
      );
    }

    return result;
  }

  static async buildProjectInWorkspace(
    workspace: TsWorkspace,
    project: TsProject,
    graph: ProjectGraph,
    options: BuildOptions = {},
  ): Promise<BuildResult> {
    const startTime = Date.now();

    // 1. Generate tsconfig files in .tsdk/generated/
    const generatedConfig = ConfigGenerator.generateWorkspaceConfigs(workspace, graph);
    await ConfigGenerator.writeGeneratedConfigs(generatedConfig);

    // 2. Target specific project config in .tsdk/generated/
    const projectConfigPath = path.join(
      generatedConfig.generatedDir,
      `${project.name}.tsconfig.json`,
    );

    const args: string[] = ['--build', projectConfigPath];

    if (options.clean) {
      args.push('--clean');
    } else if (options.rebuild) {
      args.push('--force');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    // 3. Execute tsc
    const execResult = await this.executeTsc(args, workspace.directory);
    const durationMs = Date.now() - startTime;

    const result: BuildResult = {
      success: execResult.exitCode === 0,
      exitCode: execResult.exitCode,
      output: execResult.output,
      durationMs,
      generatedConfig,
    };

    if (!result.success) {
      throw new BuildError(
        `Compilation failed with exit code ${result.exitCode}:\n${result.output}`,
        result.exitCode,
        result.output,
      );
    }

    return result;
  }

  static async buildProject(
    project: TsProject,
    graph: ProjectGraph,
    options: BuildOptions = {},
  ): Promise<BuildResult> {
    const startTime = Date.now();

    // 1. Generate standalone tsconfig files
    const generatedConfig = ConfigGenerator.generateStandaloneProjectConfig(project, graph);
    await ConfigGenerator.writeGeneratedConfigs(generatedConfig);

    // 2. Prepare arguments
    const args: string[] = ['--build', generatedConfig.rootConfigPath];

    if (options.clean) {
      args.push('--clean');
    } else if (options.rebuild) {
      args.push('--force');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    // 3. Execute tsc
    const execResult = await this.executeTsc(args, project.directory);
    const durationMs = Date.now() - startTime;

    const result: BuildResult = {
      success: execResult.exitCode === 0,
      exitCode: execResult.exitCode,
      output: execResult.output,
      durationMs,
      generatedConfig,
    };

    if (!result.success) {
      throw new BuildError(
        `Compilation failed with exit code ${result.exitCode}:\n${result.output}`,
        result.exitCode,
        result.output,
      );
    }

    return result;
  }

  static async cleanWorkspace(
    workspace: TsWorkspace,
    graph: ProjectGraph,
  ): Promise<BuildResult> {
    return this.buildWorkspace(workspace, graph, { clean: true });
  }

  private static executeTsc(
    args: string[],
    cwd: string,
  ): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve) => {
      const tscPath = this.findTscPath();
      const child = spawn(process.execPath, [tscPath, ...args], {
        cwd,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const exitCode = code ?? 0;
        const output = (stdout + (stderr ? `\n${stderr}` : '')).trim();
        resolve({ exitCode, output });
      });

      child.on('error', (err) => {
        resolve({ exitCode: 1, output: err.message });
      });
    });
  }
}
