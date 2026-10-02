export interface GeneratedConfigFile {
  filePath: string;
  content: string;
}

export interface GeneratedConfigResult {
  generatedDir: string;
  rootConfigPath: string;
  files: GeneratedConfigFile[];
  scope?: 'workspace' | 'project';
  knownProjectNames?: string[];
}

export interface TsConfigReference {
  path: string;
}

export interface TsConfigOptions {
  composite?: boolean;
  target?: string;
  module?: string;
  moduleResolution?: string;
  strict?: boolean;
  declaration?: boolean;
  declarationMap?: boolean;
  sourceMap?: boolean;
  rootDir?: string;
  outDir?: string;
  tsBuildInfoFile?: string;
  skipLibCheck?: boolean;
  esModuleInterop?: boolean;
  typeRoots?: string[];
  [key: string]: unknown;
}

export interface TsConfigSchema {
  compilerOptions?: TsConfigOptions;
  include?: string[];
  exclude?: string[];
  files?: string[];
  references?: TsConfigReference[];
}
