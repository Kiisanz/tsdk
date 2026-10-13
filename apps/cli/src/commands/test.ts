import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BuildService } from '@tsdk/build';
import { TsProject, TsWorkspace } from '@tsdk/core';
import { TsdkContext } from '../discovery.js';

export interface TestOptions {
  forceWorkspace?: boolean;
  filter?: string;
}

function findTestFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFilesRecursively(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.test.js') ||
        entry.name.endsWith('.spec.js') ||
        entry.name.endsWith('.test.mjs') ||
        entry.name.endsWith('.spec.mjs'))
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

async function runTestsForProject(project: TsProject): Promise<{ success: boolean; foundCount: number }> {
  const distDir = path.resolve(project.directory, 'dist');
  const testFiles = findTestFilesRecursively(distDir);

  if (testFiles.length === 0) {
    return { success: true, foundCount: 0 };
  }

  console.log(`\n▶ Running tests for "${project.name}" (${testFiles.length} file${testFiles.length > 1 ? 's' : ''})...`);

  return new Promise<{ success: boolean; foundCount: number }>((resolve) => {
    const child = spawn(process.execPath, ['--test', ...testFiles], {
      cwd: project.directory,
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, foundCount: testFiles.length });
    });

    child.on('error', (err) => {
      console.error(`[TSDK Error] Failed to launch test runner:`, err);
      resolve({ success: false, foundCount: testFiles.length });
    });
  });
}

export async function runTestCommand(
  context: TsdkContext,
  options: TestOptions = {},
): Promise<number> {
  const isWorkspace = context.kind === 'workspace' || options.forceWorkspace;
  const targetWorkspace: TsWorkspace | undefined =
    context.kind === 'workspace' ? context.workspace : context.parentWorkspace;

  // 1. Compile project/workspace first using existing BuildService
  console.log(
    isWorkspace && targetWorkspace
      ? `[TSDK] Building workspace "${targetWorkspace.name}" before test...`
      : context.kind === 'project'
      ? `[TSDK] Building project "${context.project.name}" before test...`
      : `[TSDK] Building before test...`,
  );

  try {
    if (isWorkspace && targetWorkspace) {
      await BuildService.buildWorkspace(targetWorkspace);
    } else if (context.kind === 'project') {
      await BuildService.buildProject(context.project, {}, context.parentWorkspace);
    }
  } catch (err: unknown) {
    console.error(`\n✖ Build failed before running tests:`);
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }

  // 2. Discover test files explicitly and run tests
  let totalTestsFound = 0;
  let allPassed = true;

  if (isWorkspace && targetWorkspace) {
    for (const project of targetWorkspace.projects) {
      const { success, foundCount } = await runTestsForProject(project);
      totalTestsFound += foundCount;
      if (!success) {
        allPassed = false;
      }
    }
  } else if (context.kind === 'project') {
    const { success, foundCount } = await runTestsForProject(context.project);
    totalTestsFound += foundCount;
    if (!success) {
      allPassed = false;
    }
  }

  // 3. Explicit reporting when no test files found (no silent success)
  if (totalTestsFound === 0) {
    console.log(`\n[TSDK Warning] No test files found (*.test.js or *.spec.js in dist/).`);
    return 0;
  }

  if (allPassed) {
    console.log(`\n✔ All tests passed successfully.`);
    return 0;
  } else {
    console.error(`\n✖ One or more tests failed.`);
    return 1;
  }
}
