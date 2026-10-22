import type { Document } from "yaml";
import { headerParts } from "./header-parts";
import { loadYaml } from "./load-yaml";
import { settablePropertyNode } from "./values";

export { headerParts } from "./header-parts";

export function frontmatter(source: string):
  | {
      raw: string;
      end: number;
      values?: Record<string, unknown>;
      editableKeys?: string[];
      editableLists?: string[];
      yaml?: { body: string; document: Document; offset: number };
      error?: string;
    }
  | undefined {
  const header = headerParts(source);
  if (!header) {
    return undefined;
  }
  const { parseDocument, isMap, isScalar } = loadYaml();
  try {
    const document = parseDocument(header.body, { uniqueKeys: true });
    if (document.errors.length) {
      throw new Error(document.errors[0]!.message);
    }
    const value: unknown = document.toJS({ maxAliasCount: 100 });
    if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
      throw new Error("Properties must be a YAML mapping.");
    }
    const editableKeys = isMap(document.contents)
      ? document.contents.items.flatMap((pair) =>
          isScalar(pair.key) &&
          typeof pair.key.value === "string" &&
          editableScalar(pair.value)
            ? [pair.key.value]
            : [],
        )
      : [];
    return {
      raw: header.raw,
      end: header.end,
      values: (value as Record<string, unknown>) ?? {},
      yaml: { body: header.body, document, offset: header.offset },
      editableKeys,
      editableLists: isMap(document.contents)
        ? document.contents.items.flatMap((pair) =>
            isScalar(pair.key) &&
            typeof pair.key.value === "string" &&
            editableList(pair.value)
              ? [pair.key.value]
              : [],
          )
        : [],
    };
  } catch (error) {
    return { raw: header.raw, end: header.end, error: String(error) };
  }
}

function editableScalar(node: unknown): boolean {
  const { isScalar } = loadYaml();
  return (
    isScalar(node) &&
    settablePropertyNode(node) &&
    (node.value === null ||
      ["boolean", "string", "number"].includes(typeof node.value)) &&
    !/BLOCK/.test(node.type ?? "") &&
    !/[\r\n]/.test(String(node.value)) &&
    (typeof node.value !== "number" || Number.isFinite(node.value))
  );
}

export function editableList(node: unknown): boolean {
  const { isSeq, isScalar } = loadYaml();
  return (
    isSeq(node) &&
    !node.tag &&
    !node.anchor &&
    node.items.every(
      (item) =>
        isScalar(item) &&
        (item.value === null ||
          ["string", "number", "boolean"].includes(typeof item.value)) &&
        !item.anchor &&
        !item.tag &&
        !item.comment &&
        !item.commentBefore,
    )
  );
}
