import * as fs from 'node:fs';
import * as path from 'node:path';

export type TemplateType = 'console' | 'library' | 'webapi';

export interface CreateProjectOptions {
  name: string;
  template: TemplateType;
  targetDir?: string;
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_.]+/g, '-')
    .toLowerCase();
}

export class TemplateGenerator {
  static createProject(options: CreateProjectOptions): string {
    const { name, template } = options;
    const projectDir = path.resolve(options.targetDir ?? process.cwd(), name);

    if (fs.existsSync(projectDir)) {
      const files = fs.readdirSync(projectDir);
      if (files.length > 0) {
        throw new Error(`Directory "${projectDir}" already exists and is not empty.`);
      }
    } else {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const pkgName = toKebabCase(name);

    if (template === 'console') {
      // 1. .tsproj manifest
      const tspContent = `schemaVersion: 1
kind: Project

metadata:
  name: ${name}
  version: 0.1.0

spec:
  type: console
  runtime: node

  source:
    root: src
    entry: src/main.ts

  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`;
      fs.writeFileSync(path.join(projectDir, `${name}.tsproj`), tspContent, 'utf-8');

      // 2. package.json
      const pkgJson = {
        name: pkgName,
        version: '0.1.0',
        type: 'module',
        main: './dist/main.js',
        devDependencies: {
          '@types/node': '^22.13.9',
        },
      };
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify(pkgJson, null, 2) + '\n',
        'utf-8',
      );

      // 3. src/main.ts
      const mainTsContent = `console.log('Hello from ${name}!');
`;
      fs.writeFileSync(path.join(srcDir, 'main.ts'), mainTsContent, 'utf-8');
    } else if (template === 'library') {
      // 1. .tsproj manifest
      const tspContent = `schemaVersion: 1
kind: Project

metadata:
  name: ${name}
  version: 0.1.0

spec:
  type: library
  runtime: node

  package:
    name: "${pkgName}"

  source:
    root: src
    entry: src/index.ts

  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`;
      fs.writeFileSync(path.join(projectDir, `${name}.tsproj`), tspContent, 'utf-8');

      // 2. package.json
      const pkgJson = {
        name: pkgName,
        version: '0.1.0',
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            default: './dist/index.js',
          },
        },
        devDependencies: {
          '@types/node': '^22.13.9',
        },
      };
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify(pkgJson, null, 2) + '\n',
        'utf-8',
      );

      // 3. src/index.ts
      const indexTsContent = `export function add(a: number, b: number): number {
  return a + b;
}
`;
      fs.writeFileSync(path.join(srcDir, 'index.ts'), indexTsContent, 'utf-8');
    } else if (template === 'webapi') {
      // 1. .tsproj manifest
      const tspContent = `schemaVersion: 1
kind: Project

metadata:
  name: ${name}
  version: 0.1.0

spec:
  type: webapi
  runtime: node

  source:
    root: src
    entry: src/main.ts

  compiler:
    target: ES2022
    module: NodeNext
    strict: true
`;
      fs.writeFileSync(path.join(projectDir, `${name}.tsproj`), tspContent, 'utf-8');

      // 2. package.json
      const pkgJson = {
        name: pkgName,
        version: '0.1.0',
        type: 'module',
        main: './dist/main.js',
        dependencies: {
          '@tsnx/web': '0.2.0-alpha.2',
        },
        devDependencies: {
          '@types/node': '^22.13.9',
        },
      };
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify(pkgJson, null, 2) + '\n',
        'utf-8',
      );

      // 3. src/main.ts
      const mainTsContent = `import process from 'node:process';
import { WebApplication, Results } from '@tsnx/web';

const builder = WebApplication.createBuilder(process.argv.slice(2));

// Configure server (reads PORT environment variable or defaults to 3000)
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
builder.configureServer({ port, host: '0.0.0.0' });

const app = builder.build();

app.mapGet('/', () => {
  return Results.json({ message: 'Welcome to ${name} API!' });
});

app.mapGet('/health', () => {
  return Results.json({ status: 'ok', timestamp: new Date().toISOString() });
});

await app.run();
`;
      fs.writeFileSync(path.join(srcDir, 'main.ts'), mainTsContent, 'utf-8');
    } else {
      throw new Error(`Unsupported template "${template}". Supported templates: console, library, webapi.`);
    }

    return projectDir;
  }
}
