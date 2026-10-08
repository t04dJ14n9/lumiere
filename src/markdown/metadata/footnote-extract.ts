import { markdownParser as language, parseMarkdown } from "../dialect/index";
import type { Text } from "@codemirror/state";
import { lowerBound } from "../../shared/positions";

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

export function extractFootnotes(doc: Text, tree = parseMarkdown(doc)): Footnotes {
  const source = doc.toString();
  if (!source.includes("[^") && !source.includes("^[")) {
    const empty: Footnotes = { definitions: [], references: new Map() };

    return empty;
  }
  const definitions: Footnote[] = [];
  const continuation = /^(?: {2,4}| {0,3}\t)/;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number),
      match = /^( {0,3})\[\^([^\]\s]+)\]:[ \t]*(.*)$/.exec(line.text);
    if (!match) {
      continue;
    }
    let node = tree.resolveInner(line.from + match[1]!.length, 1),
      excluded = false;
    while (node.parent) {
      if (
        ["FencedCode", "CodeBlock", "Frontmatter", "MathBlock", "ObsidianComment"].includes(
          node.name,
        )
      ) {
        excluded = true;
      }
      node = node.parent;
    }
    if (excluded) {
      continue;
    }
    const parts = [match[3]!],
      segments = [{ from: line.to - match[3]!.length, to: line.to, offset: 0 }];
    let to = line.to,
      length = match[3]!.length;
    while (number < doc.lines) {
      const next = doc.line(number + 1);
      if (continuation.test(next.text)) {
        const text = next.text.replace(continuation, "");
        segments.push({
          from: next.to - text.length,
          to: next.to,
          offset: length + 1,
        });
        parts.push(text);
        length += text.length + 1;
        to = next.to;
        number++;
      } else if (
        !next.text.trim() &&
        number + 2 <= doc.lines &&
        continuation.test(doc.line(number + 2).text)
      ) {
        parts.push("");
        length++;
        to = next.to;
        number++;
      } else {
        break;
      }
    }
    definitions.push({
      label: match[2]!,
      from: line.from,
      marker: line.from + match[1]!.length,
      to,
      text: parts.join("\n"),
      references: [],
      segments,
    });
  }
  const labels = new Map(definitions.map((note) => [note.label, note])),
    references = new Map<number, Footnote>();
  const definitionPositions = definitions.map((note) => note.from);
  const candidates: {
    from: number;
    to: number;
    label?: string;
    text?: string;
  }[] = [];
  const collect = (
    text: string,
    syntax: ReturnType<typeof language.parse>,
    position: (at: number) => number | undefined,
    inDefinition = false,
  ): void => {
    syntax.iterate({
      enter(node) {
        if (!["FootnoteRef", "InlineFootnote"].includes(node.name)) {
          return;
        }
        const containing = definitions[lowerBound(definitionPositions, node.from + 1) - 1];
        if (!inDefinition && containing && node.from < containing.to) {
          return false;
        }
        const from = position(node.from),
          to = position(node.to);
        let body = text.slice(node.from + 2, node.to - 1);
        if (node.name === "InlineFootnote" && body.includes("\n")) {
          let parent = node.node.parent,
            quotes = 0,
            paragraphFrom = node.from;
          while (parent) {
            if (parent.name === "Blockquote") {
              quotes++;
            }
            if (parent.name === "Paragraph") {
              paragraphFrom = parent.from;
            }
            parent = parent.parent;
          }
          const stripQuotes = (line: string): string => {
            for (let i = 0; i < quotes; i++) {
              line = line.replace(/^ {0,3}> ?/, "");
            }
            return line;
          };
          const prefix = stripQuotes(
            text.slice(text.lastIndexOf("\n", paragraphFrom - 1) + 1, paragraphFrom),
          );
          body = body
            .split("\n")
            .map((line, index) => {
              if (!index) {
                return line;
              }
              line = stripQuotes(line);
              return prefix.length && line.startsWith(" ".repeat(prefix.length))
                ? line.slice(prefix.length)
                : line;
            })
            .join("\n");
        }
        if (from !== undefined && to !== undefined) {
          candidates.push({
            from,
            to,
            ...(node.name === "FootnoteRef" ? { label: body } : { text: body }),
          });
        }
        return false;
      },
    });
  };
  collect(source, tree, (at) => at);
  for (const note of definitions) {
    if (!note.text.includes("[^") && !note.text.includes("^[")) {
      continue;
    }
    collect(
      note.text,
      language.parse(note.text),
      (at) => {
        const segment = note.segments?.find(
          (segment) => at >= segment.offset && at <= segment.offset + segment.to - segment.from,
        );
        return segment ? segment.from + at - segment.offset : undefined;
      },
      true,
    );
  }
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
  const result = { definitions, references };

  return result;
}
