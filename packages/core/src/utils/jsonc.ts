/**
 * Safely parses JSON with comments (single-line or multi-line)
 * and trailing commas, as commonly found in tsconfig.json and VS Code configurations.
 */
export function parseJsonc<T = any>(text: string): T {
  const stripped = text
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? '' : m))
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(stripped);
}
