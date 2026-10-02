export type DiagnosticCode = 'TSNX2101' | 'TSNX2102' | 'TSNX2103';

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
