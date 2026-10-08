import { isMap, isScalar, parseDocument, type YAMLMap } from "yaml";

/** Move complete YAML entries so comments, quoting and multiline values travel together. */
export function orderPropertyBody(
  body: string,
  keys: readonly string[],
  eol: string,
): string | undefined {
  try {
    const original = parseDocument(body, {
      uniqueKeys: true,
      keepSourceTokens: true,
    });
    if (original.errors.length || !isMap(original.contents)) {
      return keys.length === 0 && original.contents === null ? body : undefined;
    }
    const map = original.contents;
    const entries = propertyEntries(map);
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    if (
      keys.length !== entries.length ||
      new Set(keys).size !== keys.length ||
      keys.some((key) => !byKey.has(key))
    ) {
      return undefined;
    }
    if (keys.every((key, index) => key === entries[index]?.key)) {
      return body;
    }
    const ordered = reorderEntries({ body, keys, eol, original, entries });
    if (ordered === undefined) {
      return undefined;
    }
    return preservesValues(body, ordered, keys) ? ordered : undefined;
  } catch {
    // In particular, do not move an alias before its anchor or change its value.
    return undefined;
  }
}

function propertyEntries(map: YAMLMap) {
  return map.items.map((pair, index) => {
    if (
      !isScalar(pair.key) ||
      typeof pair.key.value !== "string" ||
      !pair.key.range
    ) {
      throw new Error("Unsupported property key");
    }
    const start =
      index === 0 ? 0 : (pair.srcToken?.start[0]?.offset ?? pair.key.range[0]);
    return { key: pair.key.value, pair, start };
  });
}

interface ReorderOptions {
  body: string;
  keys: readonly string[];
  eol: string;
  original: ReturnType<typeof parseDocument>;
  entries: ReturnType<typeof propertyEntries>;
}

function reorderEntries({
  body,
  keys,
  eol,
  original,
  entries,
}: ReorderOptions): string | undefined {
  const map = original.contents;
  if (!isMap(map)) {
    return undefined;
  }
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  if (map.flow) {
    // The caller checked that keys is a permutation of the map entries.
    map.items = keys.map((key) => byKey.get(key)!.pair);
    return original.toString({ lineWidth: 0 }).replace(/\n/g, eol);
  }
  const end = map.range?.[2];
  if (end === undefined) {
    return undefined;
  }
  const chunks = new Map(
    entries.map((entry, index) => [
      entry.key,
      body.slice(entry.start, entries[index + 1]?.start ?? end),
    ]),
  );
  return keys.map((key) => chunks.get(key)!).join("") + body.slice(end);
}

function preservesValues(
  body: string,
  ordered: string,
  keys: readonly string[],
): boolean {
  const before = parseDocument(body).toJS({ maxAliasCount: 100 }) as Record<
    string,
    unknown
  >;
  const check = parseDocument(ordered, { uniqueKeys: true });
  if (check.errors.length || !isMap(check.contents)) {
    return false;
  }
  const after = check.toJS({ maxAliasCount: 100 }) as Record<string, unknown>;
  if (
    check.contents.items.some(
      (pair, index) => !isScalar(pair.key) || pair.key.value !== keys[index],
    ) ||
    keys.some(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    )
  ) {
    return false;
  }
  return true;
}
