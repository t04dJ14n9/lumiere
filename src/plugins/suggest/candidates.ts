import type { VaultIndex, VaultFile } from "../vault/api";
import type { Suggestion } from "./protocol";
import { prepareFuzzyText } from "../../shared/fuzzy";
import { nameOf } from "../../shared/vault-path";
type Value =
  | { kind: "literal"; text: string }
  | { kind: "file"; target: VaultFile; alias?: string }
  | { kind: "block"; target: VaultFile; id: string };
export interface Candidate {
  label: string;
  detail: string;
  value: Value;
  labelText: string;
  detailText: string;
  order: string;
}
export function candidate(
  label: string,
  detail: string,
  value: Value,
): Candidate {
  return {
    label,
    detail,
    value,
    labelText: prepareFuzzyText(label),
    detailText: prepareFuzzyText(detail),
    order: candidateOrder(value),
  };
}
function candidateOrder(value: Value): string {
  if (value.kind === "literal") {
    return value.text;
  }
  return value.target.path;
}
export function fileCandidates(
  vault: VaultIndex,
  file: VaultFile,
  kind: "link" | "heading" | "block",
): Candidate[] {
  const metadata = vault.metadata(file.path);
  if (kind === "heading") {
    return (metadata?.headings ?? []).map(({ heading, level }) =>
      candidate(heading, `H${level} · ${file.path}`, {
        kind: "literal",
        text: heading,
      }),
    );
  }
  if (kind === "block") {
    return Object.values(metadata?.blocks ?? {}).map(({ id, text }) =>
      candidate(id, `${text.slice(0, 512)} · ${file.path}`, {
        kind: "block",
        target: file,
        id,
      }),
    );
  }
  return [
    candidate(
      file.extension === "md" ? file.basename : nameOf(file.path),
      file.path,
      { kind: "file", target: file },
    ),
    ...(metadata?.aliases ?? []).map((alias) =>
      candidate(alias, file.path, { kind: "file", target: file, alias }),
    ),
  ];
}
export function materialize(
  vault: VaultIndex,
  source: string,
  entry: Candidate,
  globalBlock: boolean,
): Suggestion {
  const value = entry.value;
  let insert: string;
  if (value.kind === "literal") {
    insert = value.text;
  } else if (value.kind === "block") {
    insert = globalBlock
      ? `${vault.linkText(value.target, source)}#^${value.id}`
      : value.id;
  } else {
    insert =
      vault.linkText(value.target, source) +
      (value.alias ? `|${value.alias}` : "");
  }
  return { label: entry.label, detail: entry.detail, insert };
}
export function tagCandidates(vault: VaultIndex): Candidate[] {
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
        entry: candidate(label, `${count} occurrences`, {
          kind: "literal",
          text: label,
        }),
        count,
      };
    })
    .sort(
      (a, b) => b.count - a.count || a.entry.label.localeCompare(b.entry.label),
    )
    .map(({ entry }) => entry);
}
