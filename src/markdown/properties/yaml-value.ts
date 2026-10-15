import { isNode, isScalar, stringify } from "yaml";
import type { headerParts } from "./frontmatter";
import type { PropertyScalar } from "./values";

export interface PropertyChange {
  from: number;
  to: number;
  insert: string;
}

type Header = NonNullable<ReturnType<typeof headerParts>>;

export const yamlValue = (value: unknown): string =>
  stringify(value, {
    collectionStyle: "flow",
    flowCollectionPadding: false,
    lineWidth: 0,
    aliasDuplicateObjects: false,
    defaultKeyType: "PLAIN",
  }).trimEnd();

/** Property names stay plain unless YAML requires quoting. */
export const yamlKey = (key: string): string =>
  stringify(key, {
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  }).trimEnd();

export const scalarValue = (value: unknown): value is PropertyScalar =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

/** Include a leading `&anchor` so replacement does not leave aliases retargeted. */
function valueStart(
  body: string,
  start: number,
  anchor: string | null | undefined,
): number {
  if (!anchor) {
    return start;
  }
  const token = `&${anchor}`;
  const at = body.lastIndexOf(token, start);
  return at >= 0 && at <= start ? at : start;
}

export function setPropertyChange(
  source: string,
  header: Header,
  node: unknown,
  value: unknown,
): PropertyChange | undefined {
  if (!isNode(node) || !node.range) {
    return undefined;
  }
  // Complex sequences (list-of-maps) are replaced wholesale as YAML text.
  let insert = yamlValue(value);
  if (typeof value === "string" && /[\r\n]/.test(value)) {
    // Mid-line replacements cannot use a plain multiline scalar.
    insert = JSON.stringify(value);
  } else if (
    isScalar(node) &&
    typeof value === typeof node.value &&
    typeof value === "string"
  ) {
    if (node.type === "QUOTE_SINGLE") {
      insert = "'" + value.replaceAll("'", "''") + "'";
    } else if (node.type === "QUOTE_DOUBLE") {
      insert = JSON.stringify(value);
    }
  }
  const from =
    header.offset + valueStart(header.body, node.range[0], node.anchor);
  const to = header.offset + node.range[1];
  if (source[from - 1] === ":") {
    insert = " " + insert;
  }
  if (source.slice(from, to).endsWith("\n")) {
    insert += header.eol;
  }
  return { from, to, insert };
}
