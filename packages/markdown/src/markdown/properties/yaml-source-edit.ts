import { isMap, isNode, isSeq, parseDocument } from "yaml";
import type { headerParts } from "./frontmatter";
import { valueStart, type PropertyChange } from "./yaml-value";

/** Keep the validated draft as text; decoding and serializing would lose comments. */
export function setPropertyYamlChange(
  source: string,
  header: NonNullable<ReturnType<typeof headerParts>>,
  node: unknown,
  draft: string,
): PropertyChange | undefined {
  if (!isNode(node) || !node.range) {
    return undefined;
  }
  const start = valueStart(header.body, node.range[0], node.anchor);
  const lineStart = header.body.lastIndexOf("\n", start - 1) + 1;
  const prefix = header.body.slice(lineStart, start);
  const inline = /\S/.test(prefix);
  const text = draft.replace(/\r\n/g, "\n");
  const contents = parseDocument(text).contents;
  const blockCollection =
    (isMap(contents) || isSeq(contents)) && !contents.flow;
  const startsOnNewLine = inline && (blockCollection || /^\s*#/.test(text));
  const indent = /^ */.exec(prefix)![0] + (startsOnNewLine ? "  " : "");
  let insert = text
    .split("\n")
    .map((line, index) => (index > 0 && line ? indent + line : line))
    .join(header.eol);
  if (startsOnNewLine) {
    insert = header.eol + indent + insert;
  } else if (source[header.offset + start - 1] === ":") {
    insert = " " + insert;
  }
  const from = header.offset + start;
  const to = header.offset + node.range[1];
  if (source.slice(from, to).endsWith("\n") && !insert.endsWith("\n")) {
    insert += header.eol;
  }
  return { from, to, insert };
}
