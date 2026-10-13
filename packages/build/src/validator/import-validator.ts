import * as fs from 'node:fs';
import * as path from 'node:path';
import { TsProject, TsWorkspace } from '@tsdk/core';
import ts from 'typescript';
import { ImportDiagnostic, ValidationResult } from './types.js';

interface RawImportItem {
  specifier: string;
  line: number;
  column: number;
}

export class ImportValidator {
  /**
   * Validates all projects in a workspace against reference boundaries
   */
  static validateWorkspace(workspace: TsWorkspace): ValidationResult {
    const allDiagnostics: ImportDiagnostic[] = [];

    // Map package name to project
    const packageToProjectMap = new Map<string, TsProject>();
    for (const p of workspace.projects) {
      const pkgName = p.manifest.spec.package?.name;
      if (pkgName) {
        packageToProjectMap.set(pkgName, p);
      }
    }

    for (const project of workspace.projects) {
      const projectDiagnostics = this.validateProject(project, workspace, packageToProjectMap);
      allDiagnostics.push(...projectDiagnostics);
    }

    return {
      valid: allDiagnostics.length === 0,
      diagnostics: allDiagnostics,
    };
  }

  /**
   * Validates a single project's source files against reference boundaries
   */
  static validateProject(
    project: TsProject,
    workspace?: TsWorkspace,
    packageToProjectMap?: Map<string, TsProject>,
  ): ImportDiagnostic[] {
    const diagnostics: ImportDiagnostic[] = [];

    const sourceRoot = project.manifest.spec.source?.root ?? 'src';
    const absSourceDir = path.resolve(project.directory, sourceRoot);

    if (!fs.existsSync(absSourceDir)) {
      return diagnostics;
    }

    const sourceFiles = this.findSourceFiles(absSourceDir);

    const directRefNames = new Set(
      project.references.map((r) => r.project.toLowerCase()),
    );

    // Read direct npm dependencies from package.json
    const declaredNpmDeps = this.getDeclaredNpmDependencies(project);

    // Build packageToProject map if not passed
    const pkgMap = packageToProjectMap ?? new Map<string, TsProject>();
    if (workspace && pkgMap.size === 0) {
      for (const p of workspace.projects) {
        const pkgName = p.manifest.spec.package?.name;
        if (pkgName) {
          pkgMap.set(pkgName, p);
        }
      }
    }

    const projectRealDir = this.safeRealpath(project.directory);

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sf = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
      );

      const imports = this.extractImportsFromSourceFile(sf);

      for (const item of imports) {
        const specifier = item.specifier;

        // 1. Check relative imports (starts with '.' or '..')
        if (specifier.startsWith('.')) {
          const resolvedPath = path.resolve(path.dirname(filePath), specifier);
          const resolvedRealDir = this.safeRealpath(
            fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()
              ? resolvedPath
              : path.dirname(resolvedPath),
          );

          // Check if resolved path escapes the project root directory
          if (!resolvedRealDir.startsWith(projectRealDir)) {
            // Cross-project relative import!
            diagnostics.push({
              code: 'TSDK2102',
              message: `TSDK2102: Cross-project relative import not allowed. Use package import instead.`,
              filePath,
              line: item.line,
              column: item.column,
              sourceProject: project.name,
              importSpecifier: specifier,
            });
          }
          continue;
        }

        // 2. Bare specifiers / package imports
        const packageName = this.extractPackageName(specifier);

        // Check if package belongs to another project in the workspace
        const targetWorkspaceProject = pkgMap.get(packageName);

        if (targetWorkspaceProject) {
          // If it is the project itself
          if (targetWorkspaceProject.name.toLowerCase() === project.name.toLowerCase()) {
            continue;
          }

          // Check if declared in direct references
          const isDirectRef = directRefNames.has(targetWorkspaceProject.name.toLowerCase());

          if (!isDirectRef) {
            diagnostics.push({
              code: 'TSDK2101',
              message: `TSDK2101: Undeclared project reference\nProject: ${project.name}\nImport:  ${specifier}\nTarget:  ${targetWorkspaceProject.name}\nFix: tsdk ref add ${project.name} ${targetWorkspaceProject.name}`,
              filePath,
              line: item.line,
              column: item.column,
              sourceProject: project.name,
              importSpecifier: specifier,
              targetProject: targetWorkspaceProject.name,
              fixSuggestion: `tsdk ref add ${project.name} ${targetWorkspaceProject.name}`,
            });
          }
        } else if (!specifier.startsWith('node:')) {
          // Check external npm dependency
          if (declaredNpmDeps && !declaredNpmDeps.has(packageName)) {
            // Node built-in module check
            if (!this.isNodeBuiltin(packageName)) {
              diagnostics.push({
                code: 'TSDK2103',
                message: `TSDK2103: Transitive or undeclared npm dependency "${packageName}" is imported but not declared in ${project.name}'s package.json`,
                filePath,
                line: item.line,
                column: item.column,
                sourceProject: project.name,
                importSpecifier: specifier,
              });
            }
          }
        }
      }
    }

    return diagnostics;
  }

  private static extractImportsFromSourceFile(sf: ts.SourceFile): RawImportItem[] {
    const items: RawImportItem[] = [];

    const visit = (node: ts.Node) => {
      // 1. import ... from '...' or import type ... from '...'
      if (ts.isImportDeclaration(node)) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
          items.push({
            specifier: node.moduleSpecifier.text,
            line: line + 1,
            column: character + 1,
          });
        }
      }

      // 2. export ... from '...'
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
          items.push({
            specifier: node.moduleSpecifier.text,
            line: line + 1,
            column: character + 1,
          });
        }
      }

      // 3. require('...') or import('...')
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        // require('...')
        if (
          ts.isIdentifier(expr) &&
          expr.text === 'require' &&
          node.arguments.length > 0 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
          items.push({
            specifier: (node.arguments[0] as ts.StringLiteral).text,
            line: line + 1,
            column: character + 1,
          });
        }
        // dynamic import('...')
        if (
          expr.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length > 0 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
          items.push({
            specifier: (node.arguments[0] as ts.StringLiteral).text,
            line: line + 1,
            column: character + 1,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
    return items;
  }

  private static extractPackageName(specifier: string): string {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      return parts.slice(0, 2).join('/');
    }
    return specifier.split('/')[0];
  }

  private static findSourceFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
          results.push(...this.findSourceFiles(fullPath));
        }
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') ||
          entry.name.endsWith('.tsx') ||
          entry.name.endsWith('.mts') ||
          entry.name.endsWith('.cts'))
      ) {
        results.push(fullPath);
      }
    }

    return results;
  }

  private static getDeclaredNpmDependencies(project: TsProject): Set<string> | null {
    const pkgPath = path.join(project.directory, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
      const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = new Set<string>();

      if (content.dependencies) {
        for (const k of Object.keys(content.dependencies)) deps.add(k);
      }
      if (content.devDependencies) {
        for (const k of Object.keys(content.devDependencies)) deps.add(k);
      }
      if (content.peerDependencies) {
        for (const k of Object.keys(content.peerDependencies)) deps.add(k);
      }

      return deps;
    } catch {
      return null;
    }
  }

  private static isNodeBuiltin(modName: string): boolean {
    const builtins = new Set([
      'assert',
      'async_hooks',
      'buffer',
      'child_process',
      'cluster',
      'console',
      'constants',
      'crypto',
      'dgram',
      'diagnostics_channel',
      'dns',
      'domain',
      'events',
      'fs',
      'http',
      'http2',
      'https',
      'inspector',
      'module',
      'net',
      'os',
      'path',
      'perf_hooks',
      'process',
      'punycode',
      'querystring',
      'readline',
      'repl',
      'stream',
      'string_decoder',
      'test',
      'timers',
      'tls',
      'trace_events',
      'tty',
      'url',
      'util',
      'v8',
      'vm',
      'wasi',
      'worker_threads',
      'zlib',
    ]);
    return builtins.has(modName);
  }

  private static safeRealpath(p: string): string {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  }
}
