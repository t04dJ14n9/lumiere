import { frontmatter } from "../../markdown/properties";
import type { BridgeWikiContext } from "../../shared/bridge/envelope";
import { frontmatterType } from "../../shared/wiki-page";
import type { WikiPlace } from "./api";

/** Optional envelope context. It is not OKF metadata and is omitted when unknown. */
export function wikiContext(
  place: WikiPlace | undefined,
  noteText: string | undefined,
): BridgeWikiContext | undefined {
  if (!place) {
    return undefined;
  }
  const type = noteText
    ? frontmatterType(frontmatter(noteText)?.values)
    : undefined;
  return {
    preset: place.project.layout.preset,
    bundle: place.project.layout.bundle,
    ...(place.collection ? { collection: place.collection } : {}),
    ...(type ? { type } : {}),
  };
}
