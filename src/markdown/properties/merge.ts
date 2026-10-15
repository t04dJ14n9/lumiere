import { isMap, isScalar, parseDocument } from "yaml";
import { headerParts, frontmatter } from "./frontmatter";
import {
  scalarValue,
  yamlValue,
  yamlKey,
  type PropertyChange,
} from "./yaml-value";
import { setPropertyChanges } from "./alias-edits";
import { validPropertyName } from "./types";
function propertyObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clipboardValue(
  value: unknown,
  ancestors = new Set<object>(),
): boolean {
  if (scalarValue(value)) {
    return true;
  }
  if (!value || typeof value !== "object" || ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const valid = Object.values(value).every((item) =>
    clipboardValue(item, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

function mergeValue(current: unknown, incoming: unknown): unknown {
  if (!current) {
    return incoming;
  }
  if (Array.isArray(current) && Array.isArray(incoming)) {
    return [
      ...new Set([...(current as unknown[]), ...(incoming as unknown[])]),
    ];
  }
  if (propertyObject(current) && propertyObject(incoming)) {
    const entries = new Map(Object.entries(current));
    for (const [key, value] of Object.entries(incoming)) {
      entries.set(key, mergeValue(entries.get(key), value));
    }
    return Object.fromEntries(entries);
  }
  return incoming === null ? current : incoming;
}

/** Merge a structured property paste atomically, retaining unrelated YAML bytes. */
export function mergeProperties(
  source: string,
  incoming: Record<string, unknown>,
): PropertyChange[] | undefined {
  try {
    const header = headerParts(source);
    const current = frontmatter(source)?.values;
    if (!header || !current || !validIncoming(incoming)) {
      return undefined;
    }
    const document = parseDocument(header.body, { uniqueKeys: true });
    if (
      document.errors.length ||
      (document.contents !== null && !isMap(document.contents))
    ) {
      return undefined;
    }
    const expected = new Map<string, unknown>();
    const edits = new MergeEdits(source, header, document);
    for (const [key, incomingValue] of Object.entries(incoming)) {
      const value = mergeValue(
        Object.hasOwn(current, key) ? current[key] : undefined,
        incomingValue,
      );
      expected.set(key, value);
      if (
        Object.hasOwn(current, key) &&
        JSON.stringify(current[key]) === JSON.stringify(value)
      ) {
        continue;
      }
      if (!edits.set(key, value)) {
        return undefined;
      }
    }
    const changes = edits.finish();
    return verifiesMergedValues(source, changes, expected)
      ? changes
      : undefined;
  } catch {
    return undefined;
  }
}

class MergeEdits {
  private readonly changes: PropertyChange[] = [];
  private added = "";
  constructor(
    private readonly source: string,
    private readonly header: NonNullable<ReturnType<typeof headerParts>>,
    private readonly document: ReturnType<typeof parseDocument>,
  ) {}

  set(key: string, value: unknown): boolean {
    const { document, source, header } = this;
    if (isMap(document.contents) && document.contents.flow) {
      document.set(key, value);
      return true;
    }
    const items = isMap(document.contents) ? document.contents.items : [];
    const pair = items.find(
      (pair) => isScalar(pair.key) && pair.key.value === key,
    );
    if (!pair) {
      this.added += `${yamlKey(key)}: ${yamlValue(value)}${header.eol}`;
      return true;
    }
    const changes = setPropertyChanges({
      source,
      header,
      document,
      node: pair.value,
      value,
    });
    if (!changes) {
      return false;
    }
    const [primary, ...aliases] = changes;
    // Explicit replacement wins over any overlapping prior alias-preservation.
    for (let index = this.changes.length - 1; index >= 0; index--) {
      const prior = this.changes[index]!;
      if (!(prior.to <= primary!.from || prior.from >= primary!.to)) {
        this.changes.splice(index, 1);
      }
    }
    this.changes.push(primary!);
    for (const alias of aliases) {
      if (
        this.changes.some(
          (prior) => !(prior.to <= alias.from || prior.from >= alias.to),
        )
      ) {
        continue;
      }
      this.changes.push(alias);
    }
    return true;
  }

  finish(): PropertyChange[] {
    const { document, header } = this;
    if (isMap(document.contents) && document.contents.flow) {
      this.changes.push({
        from: header.offset,
        to: header.offset + header.body.length,
        insert: document.toString({ lineWidth: 0 }).replace(/\n/g, header.eol),
      });
    } else if (this.added) {
      const at = header.offset + header.body.length;
      this.changes.push({ from: at, to: at, insert: this.added });
    }
    return this.changes;
  }
}

function verifiesMergedValues(
  source: string,
  changes: PropertyChange[],
  expected: Map<string, unknown>,
): boolean {
  let candidate = source;
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    candidate =
      candidate.slice(0, change.from) +
      change.insert +
      candidate.slice(change.to);
  }
  const result = frontmatter(candidate)?.values;
  if (
    !result ||
    [...expected].some(
      ([key, value]) => JSON.stringify(result[key]) !== JSON.stringify(value),
    )
  ) {
    return false;
  }
  return true;
}

function validIncoming(incoming: unknown): incoming is Record<string, unknown> {
  return (
    propertyObject(incoming) &&
    clipboardValue(incoming) &&
    Object.keys(incoming).every(validPropertyName)
  );
}
