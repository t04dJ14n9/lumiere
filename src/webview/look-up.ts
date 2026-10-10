import { useRegistry } from "@embedpdf/core/react";
import type { PdfDocumentObject, PdfEngine, PdfGlyphObject } from "@embedpdf/models";
import { useEffect, useRef } from "react";
import { coreWord, wordGlyphRange, type WordGlyph } from "../shared/look-up";
import { postToHost } from "./host";

/** How often the word under the pointer is looked for while it moves. */
const HOVER_MS = 120;

/**
 * macOS Look Up. The page text is drawn as images, so the system's own Look
 * Up (three-finger tap) has no text to find. Two triggers are wired instead:
 *
 * - `webkitmouseforcedown`, Safari's force click event (a hard press): look
 *   the word up at once. Chromium does not fire it today; kept for engines
 *   that do.
 * - the context menu: the word under the pointer is reported when it opens,
 *   so its Look Up entry knows which word to open.
 *
 * Off until the extension says it is on (`lookUp` host message).
 */
export function useLookUp(pdf: PdfDocumentObject, enabled: boolean): void {
  const { registry } = useRegistry();
  const engine = useRef<PdfEngine | null>(null);
  engine.current = registry?.getEngine() ?? null;
  useEffect(
    () => (enabled ? attach(() => engine.current, pdf) : undefined),
    [enabled, pdf],
  );
}

function attach(
  engine: () => PdfEngine | null,
  pdf: PdfDocumentObject,
): () => void {
  const glyphCache = new Map<number, Promise<readonly (WordGlyph | undefined)[] | undefined>>();
  let hovered: { word: string; at: [number, number] } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const wordAt = async (x: number, y: number): Promise<string | undefined> => {
    const target = pageAt(pdf, x, y);
    const eng = engine();
    if (!target || !eng) return undefined;
    const { page, point } = target;
    let glyphs = glyphCache.get(page.index);
    if (!glyphs) {
      glyphs = eng.getPageGlyphs(pdf, page).toPromise().then(
        (list) => Array.from(list, toWordGlyph),
        () => undefined,
      );
      glyphCache.set(page.index, glyphs);
    }
    const list = await glyphs;
    if (!list) return undefined;
    const index = list.findIndex(
      (glyph) =>
        glyph?.box !== undefined &&
        !glyph.isSpace &&
        point.x >= glyph.box[0] - 0.5 &&
        point.x <= glyph.box[2] + 0.5 &&
        point.y >= glyph.box[1] - 0.5 &&
        point.y <= glyph.box[3] + 0.5,
    );
    const range = index < 0 ? undefined : wordGlyphRange(list, index);
    if (!range) return undefined;
    const texts = await eng
      .getTextSlices(pdf, [
        { pageIndex: page.index, charIndex: range[0], charCount: range[1] - range[0] },
      ])
      .toPromise()
      .catch(() => undefined);
    return coreWord(texts?.[0] ?? "") || undefined;
  };

  const onMove = (event: PointerEvent): void => {
    if (timer) return;
    const { clientX, clientY } = event;
    timer = setTimeout(() => {
      timer = undefined;
      void wordAt(clientX, clientY).then((word) => {
        hovered = word ? { word, at: [clientX, clientY] } : undefined;
      });
    }, HOVER_MS);
  };
  // The menu opens now; the word was found a moment ago, under the pointer.
  const onContextMenu = (event: MouseEvent): void => {
    const near =
      hovered !== undefined &&
      Math.hypot(hovered.at[0] - event.clientX, hovered.at[1] - event.clientY) < 24;
    const known = near ? hovered?.word : undefined;
    postToHost({ type: "lookUp", word: known ?? null, open: false });
    if (known) return;
    // Not found yet (a right click without moving first): look now, report soon.
    void wordAt(event.clientX, event.clientY).then((word) => {
      if (word) postToHost({ type: "lookUp", word, open: false });
    });
  };
  const onForceWillBegin = (event: Event): void => event.preventDefault();
  const onForceDown = (event: Event): void => {
    const { clientX, clientY } = event as MouseEvent;
    void wordAt(clientX, clientY).then((word) => {
      if (word) postToHost({ type: "lookUp", word, open: true });
    });
  };
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("webkitmouseforcewillbegin", onForceWillBegin, true);
  document.addEventListener("webkitmouseforcedown", onForceDown, true);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("webkitmouseforcewillbegin", onForceWillBegin, true);
    document.removeEventListener("webkitmouseforcedown", onForceDown, true);
  };
}

/** The page under a window point, and the point in the page's own points. */
function pageAt(
  pdf: PdfDocumentObject,
  x: number,
  y: number,
): { page: PdfDocumentObject["pages"][number]; point: { x: number; y: number } } | undefined {
  const element = document
    .elementsFromPoint(x, y)
    .find((candidate) => candidate.hasAttribute("data-page-index"));
  const page = pdf.pages[Number(element?.getAttribute("data-page-index"))];
  // Pages stored sideways (/Rotate) are not looked up: their boxes are turned.
  if (!element || !page || page.rotation) return undefined;
  const rect = element.getBoundingClientRect();
  const scale = rect.width / Math.max(1, page.size.width);
  return { page, point: { x: (x - rect.left) / scale, y: (y - rect.top) / scale } };
}

function toWordGlyph(glyph: PdfGlyphObject | undefined): WordGlyph | undefined {
  if (!glyph) return undefined;
  const { x, y } = glyph.tightOrigin ?? glyph.origin;
  const { width, height } = glyph.tightSize ?? glyph.size;
  return {
    isSpace: Boolean(glyph.isSpace),
    ...(width > 0 && height > 0 ? { box: [x, y, x + width, y + height] as [number, number, number, number] } : {}),
  };
}
