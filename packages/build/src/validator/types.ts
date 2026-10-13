export type DiagnosticCode = 'TSDK2101' | 'TSDK2102' | 'TSDK2103';

export interface ImportDiagnostic {
  code: DiagnosticCode;
  message: string;
  filePath: string;
  line: number;
  column: number;
  sourceProject: string;
  importSpecifier: string;
  targetProject?: string;
  fixSuggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: ImportDiagnostic[];
}
