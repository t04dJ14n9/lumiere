import { isSeq, isScalar, parseDocument, stringify } from "yaml";
import { headerParts, frontmatter } from "./frontmatter";
import type { PropertyScalar } from "./values";
export function listPropertyChange(
  source: string,
  key: string,
  value: readonly PropertyScalar[],
) {
  const header = headerParts(source);
  if (!header || !frontmatter(source)?.editableLists?.includes(key)) {
    return undefined;
  }
  const offset = header.offset;
  const document = parseDocument(header.body);
  const node = document.get(key, true);
  if (!isSeq(node) || !node.range) {
    return undefined;
  }
  const from = offset + node.range[0];
  const to = offset + node.range[1];
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  let insert = stringify(value, {
    collectionStyle: "flow",
    flowCollectionPadding: false,
    lineWidth: 0,
  }).trimEnd();
  if (source.slice(from, to).endsWith("\n")) {
    insert += lineEnding;
  }
  return { from, to, insert };
}
export function scalarPropertyChange(
  source: string,
  key: string,
  value: PropertyScalar,
): { from: number; to: number; insert: string } | undefined {
  const header = headerParts(source);
  if (!header) {
    return undefined;
  }
  const document = parseDocument(header.body, { uniqueKeys: true });
  if (document.errors.length) {
    return;
  }
  const node = document.get(key, true);
  if (
    !isScalar(node) ||
    typeof node.value !== typeof value ||
    !node.range ||
    /BLOCK/.test(node.type ?? "")
  ) {
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return;
  }
  const insert = scalarText(value, node.type);
  const candidate = parseDocument(
    header.body.slice(0, node.range[0]) +
      insert +
      header.body.slice(node.range[1]),
    { uniqueKeys: true },
  );
  const checked = candidate.get(key, true);
  if (
    candidate.errors.length ||
    !isScalar(checked) ||
    !Object.is(checked.value, value)
  ) {
    return;
  }
  const offset = source.indexOf("\n") + 1;
  return { from: offset + node.range[0], to: offset + node.range[1], insert };
}
export function booleanPropertyChange(
  source: string,
  key: string,
  value: boolean,
) {
  return scalarPropertyChange(source, key, value);
}

function scalarText(value: PropertyScalar, style: string | undefined): string {
  if (typeof value !== "string") {
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (style === "QUOTE_SINGLE" && !/[\r\n]/.test(value)) {
    return "'" + value.replaceAll("'", "''") + "'";
  }
  if (style === "QUOTE_DOUBLE" || /[\r\n]/.test(value)) {
    return JSON.stringify(value);
  }
  return stringify(value, { lineWidth: 0 }).trimEnd();
}
