import { isMap, isScalar, isSeq, parseDocument } from "yaml";
export function headerParts(source: string) {
  const opening = /^---\r?\n/.exec(source);
  if (!opening) {
    return undefined;
  }
  const rest = source.slice(opening[0].length);
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) {
    return undefined;
  }
  const offset = opening[0].length;
  const body = rest.slice(0, closing.index);
  const end = offset + closing.index + closing[0].length;
  return {
    body,
    offset,
    end,
    raw: source.slice(0, end),
    eol: opening[0].endsWith("\r\n") ? "\r\n" : "\n",
  };
}

export function frontmatter(source: string):
  | {
      raw: string;
      end: number;
      values?: Record<string, unknown>;
      editableKeys?: string[];
      editableLists?: string[];
      error?: string;
    }
  | undefined {
  const header = headerParts(source);
  if (!header) {
    return undefined;
  }
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
          isScalar(pair.value) &&
          (pair.value.value === null ||
            ["boolean", "string", "number"].includes(
              typeof pair.value.value,
            )) &&
          !/BLOCK/.test(pair.value.type ?? "") &&
          !/[\r\n]/.test(String(pair.value.value)) &&
          (typeof pair.value.value !== "number" ||
            Number.isFinite(pair.value.value))
            ? [pair.key.value]
            : [],
        )
      : [];
    return {
      raw: header.raw,
      end: header.end,
      values: (value as Record<string, unknown>) ?? {},
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
export function editableList(node: unknown): boolean {
  return (
    isSeq(node) &&
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
