import { unresolvedKey } from "./target";

/**
 * Mark rendered anchors that miss the vault, as Obsidian dims
 * `.markdown-rendered .internal-link.is-unresolved` inside embeds.
 */
export function tagUnresolvedAnchors(
  root: ParentNode,
  unresolved: ReadonlySet<string>,
): void {
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!href || /^[a-z][a-z\d+.-]*:/i.test(href)) {
      anchor.classList.remove("is-unresolved");
      continue;
    }
    const key = unresolvedKey(href);
    anchor.classList.toggle("is-unresolved", key !== "" && unresolved.has(key));
  }
}
