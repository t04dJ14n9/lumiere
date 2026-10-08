import { tagMatches } from "../../markdown/tags/grammar";
import { fuzzyMatch } from "../../shared/fuzzy";
import type { HostViews, PickItem } from "../../shared/runtime";
import type { VaultFile, VaultIndex } from "../vault/api";

/** Metadata already includes YAML and footnote tags; no file reads are needed. */
export function taggedNotes(
  vault: VaultIndex,
  tag: string,
): PickItem<VaultFile>[] {
  return vault
    .files()
    .filter((file) => !file.excluded && /\.(md|markdown)$/i.test(file.path))
    .flatMap((file) => {
      const tags = [
        ...new Set(
          vault
            .metadata(file.path)
            ?.tags.map((item) => item.tag)
            .filter((value) => tagMatches(value, tag)) ?? [],
        ),
      ];
      return tags.length
        ? [
            {
              label: file.path,
              description: tags.map((value) => "#" + value).join(", "),
              value: file,
            },
          ]
        : [];
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
export function filterTagNotes(
  items: readonly PickItem<VaultFile>[],
  query: string,
): PickItem<VaultFile>[] {
  return items
    .flatMap((item) => {
      const match = fuzzyMatch(
        query,
        `${item.label} ${item.description ?? ""}`,
      );
      return match ? [{ item, score: match.score }] : [];
    })
    .sort(
      (a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label),
    )
    .map((value) => value.item);
}

/** Ask which note with the tag to open; `undefined` when dismissed. */
export async function pickTaggedNote(
  views: HostViews,
  vault: VaultIndex,
  tag: string,
): Promise<VaultFile | undefined> {
  const items = taggedNotes(vault, tag);
  const noun = items.length === 1 ? "note" : "notes";
  const selected = await views.pick({
    placeholder: `#${tag} — ${items.length} ${noun}`,
    items: (query) => filterTagNotes(items, query),
  });
  return selected?.item?.value;
}
