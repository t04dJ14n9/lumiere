import type { Text } from "@codemirror/state";
import type { Tree } from "@lezer/common";
import type { Footnote } from "./footnote-extract";
const continuation = /^(?: {2,4}| {0,3}\t)/;

export function footnoteDefinitions(doc: Text, tree: Tree): Footnote[] {
  const definitions: Footnote[] = [];
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const match = /^( {0,3})\[\^([^\]\s]+)\]:[ \t]*(.*)$/.exec(line.text);
    if (!match) {
      continue;
    }
    if (excludedDefinition(tree, line.from + match[1]!.length)) {
      continue;
    }
    const parsed = readDefinition(doc, number, match);
    definitions.push(parsed.note);
    number = parsed.lastLine;
  }
  return definitions;
}

function excludedDefinition(tree: Tree, at: number): boolean {
  let node = tree.resolveInner(at, 1);
  while (node.parent) {
    if (
      [
        "FencedCode",
        "CodeBlock",
        "Frontmatter",
        "MathBlock",
        "ObsidianComment",
      ].includes(node.name)
    ) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function readDefinition(doc: Text, number: number, match: RegExpExecArray) {
  const line = doc.line(number);
  const parts = [match[3]!];
  // Body offsets exclude continuation indentation; segments retain the source map.
  const segments = [
    { from: line.to - match[3]!.length, to: line.to, offset: 0 },
  ];
  let to = line.to;
  let length = match[3]!.length;
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
  const note: Footnote = {
    label: match[2]!,
    from: line.from,
    marker: line.from + match[1]!.length,
    to,
    text: parts.join("\n"),
    references: [],
    segments,
  };
  return { note, lastLine: number };
}
