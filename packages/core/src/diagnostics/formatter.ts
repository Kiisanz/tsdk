export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticItem {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export class DiagnosticFormatter {
  static format(diag: DiagnosticItem): string {
    const loc = diag.file
      ? `${diag.file}${diag.line !== undefined ? `:${diag.line}${diag.column !== undefined ? `:${diag.column}` : ''}` : ''} `
      : '';
    const sev = diag.severity === 'error' ? 'error' : diag.severity === 'warning' ? 'warning' : 'info';
    let output = `${loc}${sev} ${diag.code}: ${diag.message}`;
    if (diag.suggestion) {
      output += `\n  💡 Fix: ${diag.suggestion}`;
    }
    return output;
  }

  static parseCompilerError(rawLine: string): DiagnosticItem | null {
    // Standard tsc output format:
    // src/main.ts(12,5): error TS2307: Cannot find module '@acme/domain'
    const match = rawLine.match(/^([^(]+)(?:\((\d+),(\d+)\))?:\s+(error|warning)\s+(TS\d+):\s+(.*)$/);
    if (!match) {
      return null;
    }
    return {
      file: match[1].trim(),
      line: match[2] ? parseInt(match[2], 10) : undefined,
      column: match[3] ? parseInt(match[3], 10) : undefined,
      severity: match[4] as 'error' | 'warning',
      code: match[5],
      message: match[6],
    };
  }
}
