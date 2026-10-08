import type { VaultIndex, VaultFile } from "../vault/api";
import type { Query, Suggestion } from "./protocol";
import { matchScore } from "../../shared/fuzzy";
import { nameOf } from "../../shared/vault-path";

export function suggestions(
  vault: VaultIndex,
  source: string,
  request: Query,
): Suggestion[] {
  const candidates = collect(vault, source, request).filter(
    (item) =>
      item.label.length <= 8192 &&
      item.insert.length <= 8192 &&
      item.detail.length <= 8192,
  );
  if (request.kind === "tag" && !request.query) {
    return candidates.slice(0, 50);
  }
  return candidates
    .flatMap((item) => {
      const score = matchScore(request.query, item.label, item.detail);
      return score === undefined ? [] : [{ item, score }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.label.length - b.item.label.length ||
        a.item.label.localeCompare(b.item.label) ||
        a.item.insert.localeCompare(b.item.insert),
    )
    .slice(0, 50)
    .map(({ item }) => item);
}
function collect(
  vault: VaultIndex,
  source: string,
  request: Query,
): Suggestion[] {
  if (request.kind === "tag") {
    return tags(vault);
  }
  if (request.kind === "link") {
    return links(vault, source);
  }
  const target =
    request.note === ""
      ? vault.file(source)
      : vault.resolveLink(request.note ?? "", source);
  const files =
    request.note === undefined
      ? vault.files()
      : [target].filter((file): file is VaultFile => file !== undefined);
  return files
    .filter((file) => !file.excluded)
    .flatMap((file) => fragments(vault, file, source, request));
}
function links(vault: VaultIndex, source: string): Suggestion[] {
  const result: Suggestion[] = [];
  const unresolved = new Set<string>();
  for (const file of vault.files()) {
    if (file.excluded) {
      continue;
    }
    const insert = vault.linkText(file, source);
    result.push({
      label: file.extension === "md" ? file.basename : nameOf(file.path),
      insert,
      detail: file.path,
    });
    for (const alias of vault.metadata(file.path)?.aliases ?? []) {
      result.push({
        label: alias,
        insert: `${insert}|${alias}`,
        detail: file.path,
      });
    }
    for (const text of vault.unresolvedLinks(file.path).keys()) {
      unresolved.add(text);
    }
  }
  for (const text of unresolved) {
    result.push({ label: text, insert: text, detail: "Unresolved link" });
  }
  return result;
}
function fragments(
  vault: VaultIndex,
  file: VaultFile,
  source: string,
  request: Query,
): Suggestion[] {
  const metadata = vault.metadata(file.path);
  if (request.kind === "heading") {
    return (metadata?.headings ?? []).map(({ heading, level }) => ({
      label: heading,
      insert: heading,
      detail: `H${level} · ${file.path}`,
    }));
  }
  return Object.values(metadata?.blocks ?? {}).map(({ id, text }) => ({
    label: id,
    insert:
      request.note === undefined
        ? `${vault.linkText(file, source)}#^${id}`
        : id,
    detail: `${text.slice(0, 512)} · ${file.path}`,
  }));
}
function tags(vault: VaultIndex): Suggestion[] {
  const counts = new Map<string, Map<string, number>>();
  for (const file of vault.files()) {
    if (file.excluded) {
      continue;
    }
    for (const { tag } of vault.metadata(file.path)?.tags ?? []) {
      const name = tag.replace(/^#/, "");
      const variants =
        counts.get(name.toLowerCase()) ?? new Map<string, number>();
      variants.set(name, (variants.get(name) ?? 0) + 1);
      counts.set(name.toLowerCase(), variants);
    }
  }
  return [...counts.values()]
    .map((variants) => {
      const [label] = [...variants].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]!;
      const count = [...variants.values()].reduce((a, b) => a + b, 0);
      return {
        item: { label, insert: label, detail: `${count} occurrences` },
        count,
      };
    })
    .sort(
      (a, b) => b.count - a.count || a.item.label.localeCompare(b.item.label),
    )
    .map(({ item }) => item);
}
