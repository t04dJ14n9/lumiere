import { SourceCoordinates } from "../shared/document/coordinates";
import type { TextEdit } from "../shared/host";

/**
 * The embed in a paragraph of its own, with blank lines around it: on the
 * caret's line when that is empty, else after it. Offsets are the editor's,
 * as `hostDocuments.apply` takes them.
 */
export function insertEmbed(
  source: string,
  caret: number | undefined,
  embed: string,
): TextEdit {
  const text = new SourceCoordinates(source).editor;
  const at = Math.min(Math.max(0, caret ?? text.length), text.length);
  const line = text.lineAt(at);
  const isBlank = (number: number) => text.line(number).text.trim() === "";
  const next = line.number < text.lines ? line.number + 1 : undefined;
  let after = "\n";
  if (next !== undefined) {
    after = isBlank(next) ? "" : "\n";
  }
  if (line.text.trim() === "") {
    const before = line.number > 1 && !isBlank(line.number - 1) ? "\n" : "";
    return {
      from: line.from,
      to: line.to,
      insert: `${before}${embed}${after}`,
    };
  }
  return { from: line.to, to: line.to, insert: `\n\n${embed}${after}` };
}
