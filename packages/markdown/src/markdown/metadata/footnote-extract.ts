import { markdownParser as language, parseMarkdown } from "../dialect/parser";
import type { Text } from "@codemirror/state";
import { footnoteDefinitions } from "./footnote-definitions";
import {
  collectFootnoteCandidates,
  type FootnoteCandidate,
} from "./footnote-candidates";

export interface Footnote {
  label: string;
  from: number;
  marker: number;
  to: number;
  text: string;
  number?: number;
  references: number[];
  segments?: { from: number; to: number; offset: number }[];
}
export interface Footnotes {
  definitions: Footnote[];
  references: Map<number, Footnote>;
}

export function extractFootnotes(
  doc: Text,
  tree = parseMarkdown(doc),
): Footnotes {
  const source = doc.toString();
  if (!source.includes("[^") && !source.includes("^[")) {
    const empty: Footnotes = { definitions: [], references: new Map() };

    return empty;
  }
  const definitions = footnoteDefinitions(doc, tree);
  const candidates = collectFootnoteCandidates({
    text: source,
    syntax: tree,
    definitions,
    position: (at) => at,
  });
  for (const note of definitions) {
    if (!note.text.includes("[^") && !note.text.includes("^[")) {
      continue;
    }
    candidates.push(
      ...collectFootnoteCandidates({
        text: note.text,
        syntax: language.parse(note.text),
        definitions,
        inDefinition: true,
        position: (at) => definitionPosition(note.segments, at),
      }),
    );
  }
  return { definitions, references: numberReferences(definitions, candidates) };
}

function numberReferences(
  definitions: Footnote[],
  candidates: FootnoteCandidate[],
): Map<number, Footnote> {
  const labels = new Map(definitions.map((note) => [note.label, note]));
  const references = new Map<number, Footnote>();
  let count = 0;
  for (const candidate of candidates.sort((a, b) => a.from - b.from)) {
    if (candidate.text !== undefined) {
      const note: Footnote = {
        label: "",
        from: candidate.from,
        marker: candidate.from,
        to: candidate.to,
        text: candidate.text,
        number: ++count,
        references: [candidate.from],
      };
      references.set(candidate.from, note);
      continue;
    }
    const note = labels.get(candidate.label!);
    if (!note) {
      continue;
    }
    note.number ??= ++count;
    note.references.push(candidate.from);
    references.set(candidate.from, note);
  }
  return references;
}

export function definitionPosition(
  segments: Footnote["segments"],
  at: number,
): number | undefined {
  const segment = segments?.find(
    (segment) =>
      at >= segment.offset && at <= segment.offset + segment.to - segment.from,
  );
  return segment ? segment.from + at - segment.offset : undefined;
}
