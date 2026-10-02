import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export interface PackageManagerResolution {
  pm: PackageManager;
  installDir: string;
  isWorkspace: boolean;
}

export interface DetectOptions {
  explicitPm?: string;
  projectDir: string;
  contextWorkspaceDir?: string;
}

export class PackageManagerDetector {
  static readonly SUPPORTED: readonly PackageManager[] = ['pnpm', 'npm', 'yarn', 'bun'];

  static resolve(options: DetectOptions): PackageManagerResolution {
    const { explicitPm, projectDir, contextWorkspaceDir } = options;

    // 0. Determine workspace root directory if inside workspace
    let rootDir = contextWorkspaceDir;
    if (!rootDir) {
      rootDir = this.findWorkspaceRoot(projectDir) ?? undefined;
    }

    const isWorkspace = !!rootDir && path.resolve(rootDir) !== path.resolve(projectDir);
    const installDir = rootDir ?? projectDir;

    // 1. Explicit override
    if (explicitPm) {
      const normalized = explicitPm.trim().toLowerCase() as PackageManager;
      if (!this.SUPPORTED.includes(normalized)) {
        throw new Error(
          `[TSNX Error] Unsupported package manager "${explicitPm}". Supported package managers: ${this.SUPPORTED.join(', ')}.`,
        );
      }
      return { pm: normalized, installDir, isWorkspace };
    }

    // 2. Detect packageManager field from package.json in workspace/project root
    const pkgJsonPath = path.join(installDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (typeof pkg.packageManager === 'string') {
          const pmName = pkg.packageManager.split('@')[0].trim().toLowerCase() as PackageManager;
          if (this.SUPPORTED.includes(pmName)) {
            return { pm: pmName, installDir, isWorkspace };
          }
        }
      } catch {
        // Ignore JSON parse errors and continue to lockfile detection
      }
    }

    // 3. Detect lockfile in installDir (workspace root or project root)
    const detectedLockfiles: { pm: PackageManager; file: string }[] = [];
    const lockfileMap: Record<string, PackageManager> = {
      'pnpm-lock.yaml': 'pnpm',
      'package-lock.json': 'npm',
      'yarn.lock': 'yarn',
      'bun.lockb': 'bun',
      'bun.lock': 'bun',
    };

    for (const [file, pm] of Object.entries(lockfileMap)) {
      if (fs.existsSync(path.join(installDir, file))) {
        if (!detectedLockfiles.some((d) => d.pm === pm)) {
          detectedLockfiles.push({ pm, file });
        }
      }
    }

    // Check for conflicting lockfiles
    if (detectedLockfiles.length > 1) {
      const fileNames = detectedLockfiles.map((d) => d.file).join(', ');
      throw new Error(
        `[TSNX Error] Conflicting lockfiles detected in "${installDir}" (${fileNames}). Please specify the package manager explicitly using --package-manager <${this.SUPPORTED.join('|')}>.`,
      );
    }

    if (detectedLockfiles.length === 1) {
      return { pm: detectedLockfiles[0].pm, installDir, isWorkspace };
    }

    // Also check for pnpm-workspace.yaml if no lockfiles exist yet
    if (fs.existsSync(path.join(installDir, 'pnpm-workspace.yaml'))) {
      return { pm: 'pnpm', installDir, isWorkspace };
    }

    // 4. Default to npm
    return { pm: 'npm', installDir, isWorkspace };
  }

  static findWorkspaceRoot(startDir: string): string | null {
    let current = path.resolve(startDir);
    while (true) {
      try {
        const entries = fs.readdirSync(current);
        if (
          entries.some((e) => e.endsWith('.tswork')) ||
          entries.includes('pnpm-workspace.yaml')
        ) {
          return current;
        }
        if (entries.includes('package.json')) {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf-8'));
            if (pkg && pkg.workspaces) {
              return current;
            }
          } catch {
            // ignore
          }
        }
      } catch {
        break;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }
}

export function installDependencies(pm: PackageManager, installDir: string): void {
  const isWindows = process.platform === 'win32';
  execFileSync(pm, ['install'], {
    cwd: installDir,
    stdio: 'pipe',
    shell: isWindows,
  });
}
