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
