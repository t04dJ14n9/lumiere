import type { EditorState, TransactionSpec } from "@codemirror/state";
import { taskMarker } from "../../markdown/tasks";
import type { TextEdit } from "../../shared/runtime";
export function taskEdit(text: string, lineNumber: number, expected: string, checked: boolean): TextEdit | undefined {
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 0) return undefined;
  const lines = text.split("\n");
  const line = lines[lineNumber];
  if (line !== expected) return undefined;
  const marker = taskMarker(line);
  if (marker === undefined) return undefined;
  const from = lines.slice(0, lineNumber).reduce((sum, line) => sum + line.length + 1, 0) + marker;
  return { from, to: from + 1, insert: checked ? "x" : " " };
}
export function checklistEdit(state: EditorState, cycle: boolean): TransactionSpec {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to > from && state.doc.lineAt(to).from === to ? to - 1 : to).number;
  const changes: TextEdit[] = [];
  for (let number = first; number <= last; number++) {
    const line = state.doc.line(number);
    const marker = taskMarker(line.text);
    if (marker !== undefined) {
      if (cycle && line.text[marker] !== " ") changes.push({ from: line.from + marker - 1, to: line.from + marker + 2 + (line.text[marker + 2] === " " ? 1 : 0), insert: "" });
      else changes.push({ from: line.from + marker, to: line.from + marker + 1, insert: line.text[marker] === " " ? "x" : " " });
    } else {
      const list = /^(?:[ \t]*>[ \t]*)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.exec(line.text);
      const at = line.from + (list?.[0].length ?? 0);
      changes.push({ from: at, to: at, insert: list ? "[ ] " : "- [ ] " });
    }
  }
  return { changes, userEvent: "input.checklist" };
}
