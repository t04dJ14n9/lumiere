/**
 * How far the embedder's controls reach over the top of the page. On the
 * iPad they float as glass over the note, which scrolls under them; the
 * window says how tall they are (host-node's embedding.ts, `inset`), and the
 * page keeps line 1, the sticky headings, the find bar and every jump below
 * them. Elsewhere it is 0.
 */
import { EditorView } from "@codemirror/view";

export const CHROME_INSET_VARIABLE = "--lumiere-inset-top";

/** The inset in CSS pixels, as the page's root has it. */
export function chromeInsetTop(
  doc: Pick<Document, "documentElement"> & {
    readonly defaultView: Pick<Window, "getComputedStyle"> | null;
  },
): number {
  const value = doc.defaultView
    ?.getComputedStyle(doc.documentElement)
    .getPropertyValue(CHROME_INSET_VARIABLE);
  const pixels = Number.parseFloat(value ?? "");
  return Number.isFinite(pixels) && pixels > 0 ? pixels : 0;
}

/** A scrolled-to line lands below the embedder's controls. */
export const chromeInsetMargins = EditorView.scrollMargins.of((view) => ({
  top: chromeInsetTop(view.dom.ownerDocument),
}));
