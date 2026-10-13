import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DiagnosticFormatter } from '../diagnostics/formatter.js';

describe('DiagnosticFormatter & Unified Diagnostics', () => {
  it('formats structured TSDK diagnostics correctly with code, severity, and suggestion', () => {
    const formatted = DiagnosticFormatter.format({
      file: 'apps/Acme.Api/Acme.Api.tsproj',
      line: 12,
      column: 3,
      severity: 'error',
      code: 'TSDK2101',
      message: 'Undeclared project reference: Acme.Domain',
      suggestion: 'Run "tsdk ref add Acme.Domain" to declare the reference.',
    });

    assert.ok(formatted.includes('apps/Acme.Api/Acme.Api.tsproj:12:3 error TSDK2101: Undeclared project reference: Acme.Domain'));
    assert.ok(formatted.includes('💡 Fix: Run "tsdk ref add Acme.Domain" to declare the reference.'));
  });

  it('parses native compiler errors while strictly preserving TS original error code', () => {
    const rawTscError = 'src/main.ts(24,10): error TS2307: Cannot find module "@acme/domain" or its corresponding type declarations.';
    const parsed = DiagnosticFormatter.parseCompilerError(rawTscError);

    assert.ok(parsed);
    assert.equal(parsed.file, 'src/main.ts');
    assert.equal(parsed.line, 24);
    assert.equal(parsed.column, 10);
    assert.equal(parsed.severity, 'error');
    // Ensure TS2307 is NOT renamed or remapped to TSDK
    assert.equal(parsed.code, 'TS2307');
    assert.equal(parsed.message, 'Cannot find module "@acme/domain" or its corresponding type declarations.');

    const reFormatted = DiagnosticFormatter.format(parsed);
    assert.equal(reFormatted, 'src/main.ts:24:10 error TS2307: Cannot find module "@acme/domain" or its corresponding type declarations.');
  });
});
