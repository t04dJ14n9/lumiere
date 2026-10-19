import { useRegistry } from "@embedpdf/core/react";
import type {
  PdfDocumentObject,
  PdfEngine,
  PdfGlyphObject,
} from "@embedpdf/models";
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
export function useLookUp(
  pdf: PdfDocumentObject,
  enabled: boolean,
): () => void {
  const { registry } = useRegistry();
  const engine = useRef<PdfEngine | null>(null);
  engine.current = registry?.getEngine() ?? null;
  const command = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const binding = attach(() => engine.current, pdf);
    command.current = binding.open;
    return () => {
      command.current = undefined;
      binding.dispose();
    };
  }, [enabled, pdf]);
  return useCallback(() => command.current?.(), []);
}

function attach(
  engine: () => PdfEngine | null,
  pdf: PdfDocumentObject,
): { dispose(): void; open(): void } {
  return new LookUpBinding(new PageWords(engine, pdf));
}

type Glyphs = readonly (WordGlyph | undefined)[];

/** The words on the pages of one PDF, found under window points. */
class PageWords {
  private readonly glyphs = new Map<number, Promise<Glyphs | undefined>>();

  constructor(
    private readonly engine: () => PdfEngine | null,
    private readonly pdf: PdfDocumentObject,
  ) {}

  /** The word under a window point, if the pointer is still on it. */
  async at(x: number, y: number): Promise<string | undefined> {
    const target = pageAt(this.pdf, x, y);
    const engine = this.engine();
    if (!target || !engine) {
      return undefined;
    }
    const { page, point } = target;
    const list = await this.glyphsOf(engine, page);
    const index =
      list?.findIndex(
        (glyph) =>
          glyph?.box !== undefined &&
          !glyph.isSpace &&
          point.x >= glyph.box[0] - 0.5 &&
          point.x <= glyph.box[2] + 0.5 &&
          point.y >= glyph.box[1] - 0.5 &&
          point.y <= glyph.box[3] + 0.5,
      ) ?? -1;
    const range = index < 0 ? undefined : wordGlyphRange(list!, index);
    if (!range) {
      return undefined;
    }
    const texts = await engine
      .getTextSlices(this.pdf, [
        {
          pageIndex: page.index,
          charIndex: range[0],
          charCount: range[1] - range[0],
        },
      ])
      .toPromise()
      .catch(() => undefined);
    // The page may have scrolled or zoomed under the pointer meanwhile.
    const current = pageAt(this.pdf, x, y);
    if (
      !current ||
      current.page.index !== page.index ||
      Math.abs(current.point.x - point.x) > 0.1 ||
      Math.abs(current.point.y - point.y) > 0.1
    ) {
      return undefined;
    }
    return coreWord(texts?.[0] ?? "") || undefined;
  }

  private glyphsOf(
    engine: PdfEngine,
    page: PdfDocumentObject["pages"][number],
  ): Promise<Glyphs | undefined> {
    let glyphs = this.glyphs.get(page.index);
    if (!glyphs) {
      glyphs = engine
        .getPageGlyphs(this.pdf, page)
        .toPromise()
        .then(
          (list) => Array.from(list, toWordGlyph),
          () => undefined,
        );
      this.glyphs.set(page.index, glyphs);
    }
    return glyphs;
  }
}

/**
 * Look Up's triggers on the document: the pointer, the context menu and a
 * force click. The latest request wins; older answers are dropped.
 */
class LookUpBinding {
  private generation = 0;
  private live = true;
  /** A context menu is open over a word: hovering no longer moves it. */
  private menuTarget = false;
  private clicked: { x: number; y: number } | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners: [
    string,
    EventListener,
    boolean | AddEventListenerOptions,
  ][] = [
    ["pointerdown", this.clearTarget.bind(this), true],
    [
      "keydown",
      ((event: KeyboardEvent) => {
        if (event.key === "Escape") {
          this.clearTarget();
        }
      }) as EventListener,
      true,
    ],
    ["scroll", this.clearTarget.bind(this), true],
    ["pointermove", this.onMove.bind(this) as EventListener, { passive: true }],
    ["contextmenu", this.onContextMenu.bind(this) as EventListener, true],
    // Keep Safari's own force-click preview from opening as well.
    ["webkitmouseforcewillbegin", (event) => event.preventDefault(), true],
    ["webkitmouseforcedown", this.onForceDown.bind(this), true],
  ];

  constructor(private readonly words: PageWords) {
    for (const [type, listener, options] of this.listeners) {
      document.addEventListener(type, listener, options);
    }
  }

  /** Look up the word the context menu was opened on (bound: it is handed out). */
  readonly open = (): void => {
    if (this.clicked && this.live) {
      this.report(this.clicked.x, this.clicked.y, true);
    }
  };

  readonly dispose = (): void => {
    this.live = false;
    this.generation++;
    clearTimeout(this.timer);
    for (const [type, listener, options] of this.listeners) {
      document.removeEventListener(type, listener, options);
    }
  };

  private report(x: number, y: number, open: boolean): void {
    const request = ++this.generation;
    void this.words.at(x, y).then((word) => {
      if (this.live && request === this.generation) {
        postToHost({ type: "lookUp", word: word ?? null, open });
      }
    });
  }

  private onMove(event: PointerEvent): void {
    if (this.menuTarget) {
      return;
    }
    clearTimeout(this.timer);
    const { clientX, clientY } = event;
    this.generation++;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.report(clientX, clientY, false);
    }, HOVER_MS);
  }

  private clearTarget(): void {
    this.menuTarget = false;
    this.clicked = undefined;
    this.generation++;
    clearTimeout(this.timer);
    postToHost({ type: "lookUp", word: null, open: false });
  }

  // Always resolve the clicked point. A nearby pointer or cached pre-scroll
  // word is not evidence for the word under this context menu.
  private onContextMenu(event: MouseEvent): void {
    this.clearTarget();
    this.menuTarget = true;
    this.clicked = { x: event.clientX, y: event.clientY };
    this.report(event.clientX, event.clientY, false);
  }

  private onForceDown(event: Event): void {
    const { clientX, clientY } = event as MouseEvent;
    this.clearTarget();
    this.report(clientX, clientY, true);
  }
}

/** The page under a window point, and the point in the page's own points. */
function pageAt(
  pdf: PdfDocumentObject,
  x: number,
  y: number,
):
  | {
      page: PdfDocumentObject["pages"][number];
      point: { x: number; y: number };
    }
  | undefined {
  const element = document
    .elementsFromPoint(x, y)
    .find((candidate) => candidate.hasAttribute("data-page-index"));
  const page = pdf.pages[Number(element?.getAttribute("data-page-index"))];
  // Pages stored sideways (/Rotate) are not looked up: their boxes are turned.
  if (!element || !page || page.rotation) {
    return undefined;
  }
  const rect = element.getBoundingClientRect();
  const scale = rect.width / Math.max(1, page.size.width);
  return {
    page,
    point: { x: (x - rect.left) / scale, y: (y - rect.top) / scale },
  };
}

function toWordGlyph(glyph: PdfGlyphObject | undefined): WordGlyph | undefined {
  if (!glyph) {
    return undefined;
  }
  const { x, y } = glyph.tightOrigin ?? glyph.origin;
  const { width, height } = glyph.tightSize ?? glyph.size;
  return {
    isSpace: Boolean(glyph.isSpace),
    ...(width > 0 && height > 0
      ? {
          box: [x, y, x + width, y + height] as [
            number,
            number,
            number,
            number,
          ],
        }
      : {}),
  };
}
