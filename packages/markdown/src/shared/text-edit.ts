import { SourceCoordinates } from "./document/coordinates";
import type { TextEdit } from "./host";

/** Replace a whole note. Offsets are CodeMirror's, which `apply` expects. */
export function replaceAllEdit(source: string, next: string): TextEdit {
  const length = new SourceCoordinates(source).editor.length;
  return { from: 0, to: length, insert: next };
}

/** Insert at an editor offset, or at the end when the caret is unknown. */
export function insertEdit(
  source: string,
  at: number | undefined,
  text: string,
): TextEdit {
  const length = new SourceCoordinates(source).editor.length;
  const offset = at === undefined ? length : Math.min(Math.max(0, at), length);
  const prefix = offset === 0 ? "" : "\n";
  return { from: offset, to: offset, insert: `${prefix}${text}\n` };
}
