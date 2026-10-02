import { GeneratedConfigResult } from '../generator/types.js';

export interface BuildOptions {
  rebuild?: boolean;
  clean?: boolean;
  verbose?: boolean;
  skipValidation?: boolean;
}

export interface BuildResult {
  success: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
  generatedConfig: GeneratedConfigResult;
  diagnostics?: string[];
}
