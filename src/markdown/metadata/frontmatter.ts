import { isMap, isSeq, isScalar, parseDocument } from "yaml";
import { headerParts } from "../properties/frontmatter";
import { wikiTarget } from "../html/helpers";
import type { NoteMetadata, Position } from "./types";
/** Walk YAML values, never comments or keys; ranges retain original source offsets. */
export function frontmatterLinks(
  source: string,
  position: (from: number, to: number) => Position,
): NoteMetadata["frontmatterLinks"] {
  const header = headerParts(source);
  if (!header) {
    return [];
  }
  const doc = parseDocument(header.body, { uniqueKeys: true });
  if (doc.errors.length) {
    return [];
  }
  const offset = header.offset;
  const links: NoteMetadata["frontmatterLinks"] = [];
  function visit(node: unknown, key: string, depth: number): void {
    if (depth > 64) {
      return;
    }
    if (isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.key)) {
          visit(
            pair.value,
            key ? `${key}.${String(pair.key.value)}` : String(pair.key.value),
            depth + 1,
          );
        }
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, index) =>
        visit(item, `${key}.${index}`, depth + 1),
      );
    } else if (isScalar(node) && typeof node.value === "string" && node.range) {
      const from = offset + node.range[0];
      const raw = source.slice(from, offset + node.range[1]);
      for (const match of raw.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
        links.push({
          key,
          link: wikiTarget(match[1]!).target,
          original: match[0],
          position: position(
            from + match.index,
            from + match.index + match[0].length,
          ),
        });
      }
    }
  }
  visit(doc.contents, "", 0);
  return links;
}
