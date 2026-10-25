/** MathJax `configmacros` entry: replacement string, or [template, argCount]. */
export type MathMacro = string | [string, number];

const NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const MAX_VALUE = 4096;
const MAX_ARGS = 9;

/**
 * Normalize Obsidian-style MathJax macros (name → replacement). Names must be
 * TeX control-sequence identifiers. Values that use `#1`…`#n` become
 * `[template, n]` for MathJax configmacros.
 */
export function normalizeMacros(
  raw: Record<string, string> | undefined,
): Record<string, MathMacro> {
  if (!raw) {
    return {};
  }
  const out: Record<string, MathMacro> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!NAME.test(name) || typeof value !== "string") {
      continue;
    }
    if (value.length === 0 || value.length > MAX_VALUE) {
      continue;
    }
    out[name] = macroDefinition(value);
  }
  return out;
}

function macroDefinition(value: string): MathMacro {
  let max = 0;
  for (const match of value.matchAll(/#(\d)/g)) {
    const n = Number(match[1]);
    if (n > max && n <= MAX_ARGS) {
      max = n;
    }
  }
  return max > 0 ? [value, max] : value;
}

/** Stable compare for reconfigure skips. */
export function macrosEqual(
  a: Record<string, MathMacro>,
  b: Record<string, MathMacro>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
