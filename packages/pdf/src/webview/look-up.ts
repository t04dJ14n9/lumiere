import { useRegistry } from "@embedpdf/core/react";
import type { PdfDocumentObject, PdfEngine, PdfGlyphObject } from "@embedpdf/models";
import { useCallback, useEffect, useRef } from "react";
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
export function useLookUp(pdf: PdfDocumentObject, enabled: boolean): () => void {
  const { registry } = useRegistry();
  const engine = useRef<PdfEngine | null>(null);
  engine.current = registry?.getEngine() ?? null;
  const command = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const binding = attach(() => engine.current, pdf);
    command.current = binding.open;
    return () => { command.current = undefined; binding.dispose(); };
  }, [enabled, pdf]);
  return useCallback(() => command.current?.(), []);
}

function attach(
  engine: () => PdfEngine | null,
  pdf: PdfDocumentObject,
): { dispose(): void; open(): void } {
  const glyphCache = new Map<number, Promise<readonly (WordGlyph | undefined)[] | undefined>>();
  let generation = 0;
  let live = true;
  let menuTarget = false;
  let clicked: { x: number; y: number } | undefined;
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
    const current = pageAt(pdf, x, y);
    if (!current || current.page.index !== page.index
      || Math.abs(current.point.x - point.x) > 0.1
      || Math.abs(current.point.y - point.y) > 0.1) return undefined;
    return coreWord(texts?.[0] ?? "") || undefined;
  };

  const reportAt = (x: number, y: number, open: boolean): void => {
    const request = ++generation;
    void wordAt(x, y).then(word => {
      if (live && request === generation) {
        postToHost({ type: "lookUp", word: word ?? null, open });
      }
    });
  };
  const onMove = (event: PointerEvent): void => {
    if (menuTarget) return;
    clearTimeout(timer);
    const { clientX, clientY } = event;
    generation++;
    timer = setTimeout(() => {
      timer = undefined;
      reportAt(clientX, clientY, false);
    }, HOVER_MS);
  };
  const clearTarget = (): void => {
    menuTarget = false;
    clicked = undefined;
    generation++;
    clearTimeout(timer);
    postToHost({ type: "lookUp", word: null, open: false });
  };
  // Always resolve the clicked point. A nearby pointer or cached pre-scroll
  // word is not evidence for the word under this context menu.
  const onContextMenu = (event: MouseEvent): void => {
    clearTarget();
    menuTarget = true;
    clicked = { x: event.clientX, y: event.clientY };
    reportAt(event.clientX, event.clientY, false);
  };
  const onForceWillBegin = (event: Event): void => event.preventDefault();
  const onForceDown = (event: Event): void => {
    const { clientX, clientY } = event as MouseEvent;
    clearTarget();
    reportAt(clientX, clientY, true);
  };
  const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") clearTarget(); };
  document.addEventListener("pointerdown", clearTarget, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("scroll", clearTarget, true);
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("webkitmouseforcewillbegin", onForceWillBegin, true);
  document.addEventListener("webkitmouseforcedown", onForceDown, true);
  return {
    open: () => { if (clicked && live) reportAt(clicked.x, clicked.y, true); },
    dispose: () => {
    live = false;
    generation++;
    clearTimeout(timer);
    document.removeEventListener("pointerdown", clearTarget, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("scroll", clearTarget, true);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("webkitmouseforcewillbegin", onForceWillBegin, true);
    document.removeEventListener("webkitmouseforcedown", onForceDown, true);
    },
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
