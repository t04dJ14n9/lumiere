import type { Document } from "yaml";
import { headerParts } from "../properties/header-parts";
import { loadYaml } from "../properties/load-yaml";
import { wikiTarget } from "../html/helpers";
import type { NoteMetadata, Position } from "./types";

type FrontmatterYaml = {
  body: string;
  document: Document;
  offset: number;
};

/**
 * Walk YAML values, never comments or keys; ranges retain original source
 * offsets. Pass `parsed` from `frontmatter().yaml` to skip a second
 * `parseDocument` on the cold metadata path.
 */
export function frontmatterLinks(
  source: string,
  position: (from: number, to: number) => Position,
  parsed?: FrontmatterYaml,
): NoteMetadata["frontmatterLinks"] {
  const yaml = parsed ?? parseFrontmatterYaml(source);
  if (!yaml) {
    return [];
  }
  const { isMap, isSeq, isScalar } = loadYaml();
  const offset = yaml.offset;
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
  visit(yaml.document.contents, "", 0);
  return links;
}

function parseFrontmatterYaml(source: string): FrontmatterYaml | undefined {
  const header = headerParts(source);
  if (!header) {
    return undefined;
  }
  const { parseDocument } = loadYaml();
  const document = parseDocument(header.body, { uniqueKeys: true });
  if (document.errors.length) {
    return undefined;
  }
  return { body: header.body, document, offset: header.offset };
}
