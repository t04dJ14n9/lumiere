import { Text } from "@codemirror/state";
import { metadata } from "./index";
import type { Footnotes, Footnote } from "./footnote-extract";
import type { SourceRange } from "./fragments";
export type { Footnotes, Footnote } from "./footnote-extract";
export function footnotes(doc: Text): Footnotes {
  return metadata(doc).footnotes;
}
/** Supply definitions needed by a fragment without admitting unrelated note content. */
export function fragmentWithFootnotes(source: string, selection: SourceRange): string {
  if (selection.from === 0 && selection.to === source.length) {
    return selection.text;
  }
  const registry = footnotes(Text.of(source.split("\n"))),
    queue: Footnote[] = [];
  for (const [at, note] of registry.references) {
    if (at >= selection.from && at < selection.to && note.label) {
      queue.push(note);
    }
  }
  const visited = new Set<number>(),
    missing: Footnote[] = [];
  for (let index = 0; index < queue.length; index++) {
    const note = queue[index]!;
    if (visited.has(note.from)) {
      continue;
    }
    visited.add(note.from);
    if (note.from < selection.from || note.to > selection.to) {
      missing.push(note);
    }
    for (const [at, dependency] of registry.references) {
      if (at >= note.from && at < note.to && dependency.label) {
        queue.push(dependency);
      }
    }
  }
  return (
    selection.text +
    missing.map((note) => `\n\n[^${note.label}]: ${note.text.replace(/\n/g, "\n    ")}`).join("")
  );
}
