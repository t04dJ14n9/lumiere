import type { EditorState } from "@codemirror/state";

/**
 * Plain display-math fence line: ≤3 spaces then `$$` alone or with trailing
 * spaces (Obsidian/Pandoc). Inline `$…$` is not matched. No quote/list prefix.
 */
const mathFence = /^ {0,3}\$\$[ \t]*$/u;

/**
 * Caret on a plain `$$` math fence line (BH-090).
 * Tab via indentMore with a hard-tab unit indents the fence (≥4) so it is no
 * longer a display-math opener — same class as code-fence Tab (BH-089).
 */
export function onMathFence(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  return mathFence.test(state.doc.lineAt(main.head).text);
}

/**
 * Optional blockquote markers, then display-math fence: ≤3 spaces then `$$`
 * alone or with trailing spaces (Obsidian/Pandoc). Inline `$…$` is not matched.
 */
const quotedMath = /^((?:[ \t]*>[ \t]?)*)( {0,3}\$\$[ \t]*)$/u;

/**
 * Caret on a blockquote-wrapped `$$` math fence (BH-095).
 * Tab via nestQuote would add another `>` and change fence depth in the
 * quote stack; treat as a handled no-op (quoted-fence Tab BH-094 parity).
 * Plain `$$` is BH-090 (#372).
 */
export function onQuotedMathFence(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  const text = state.doc.lineAt(main.head).text;
  const match = quotedMath.exec(text);
  return Boolean(match && (match[1] ?? "").includes(">"));
}
