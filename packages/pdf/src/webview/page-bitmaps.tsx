import type { PdfDocumentObject } from "@embedpdf/models";
import { useRenderCapability } from "@embedpdf/plugin-render/react";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import {
  BitmapCache,
  lowScale,
  prefetchRange,
  type RenderTask,
} from "../shared/bitmap-cache";
import { DOCUMENT_ID } from "./plugins";
import { currentPageColors, onPageColorsChange } from "./page-colors";
import { PAGE_COLORS_ENGINE_AVAILABLE } from "../shared/page-colors-engine";

/**
 * The decoded low bitmaps, held while they are cached: a picture that is
 * decoded already shows in the very frame it is put on screen, with no blank
 * one before it loads. (They are small: half the size. Full bitmaps are not
 * held, they can be large.)
 */
const decoded = new Map<string, HTMLImageElement>();
const urls = {
  create(blob: unknown, quality: "low" | "full"): string {
    const url = URL.createObjectURL(blob as Blob);
    if (quality === "low") {
      const image = new Image();
      image.src = url;
      image.decode().catch(() => undefined);
      decoded.set(url, image);
    }
    return url;
  },
  revoke(url: string): void {
    decoded.delete(url);
    URL.revokeObjectURL(url);
  },
};

const BitmapContext = createContext<BitmapCache | undefined>(undefined);

/**
 * The page bitmaps of the open PDF (see `BitmapCache`), for the pages inside,
 * and a low-quality prefetch of the pages around the ones on screen.
 */
export function PageBitmaps({
  pdf,
  scroller,
  children,
}: {
  pdf: PdfDocumentObject;
  scroller: RefObject<HTMLElement | null>;
  children: React.ReactNode;
}): React.JSX.Element {
  const { provides } = useRenderCapability();
  const [pageColors, setPageColors] = useState(currentPageColors);
  useEffect(
    () => onPageColorsChange(() => setPageColors(currentPageColors())),
    [],
  );
  const cache = useMemo(
    () =>
      provides
        ? new BitmapCache(
            (pageIndex, scaleFactor, dpr) =>
              provides.forDocument(DOCUMENT_ID).renderPage({
                pageIndex,
                options: renderOptions(scaleFactor, dpr, pageColors),
              }) as unknown as RenderTask,
            urls,
          )
        : undefined,
    // Rebuild when page colors change so open bitmaps refresh.
    [provides, pageColors],
  );
  useEffect(() => () => cache?.dispose(), [cache]);
  usePrefetch(cache, pdf.pages.length, scroller);
  return (
    <BitmapContext.Provider value={cache}>{children}</BitmapContext.Provider>
  );
}

/**
 * Keep a low bitmap of every page near the pages on screen. The pages on
 * screen are read from the DOM (paged mode mounts only the ones shown), and the
 * prefetch follows them as they change.
 */
function usePrefetch(
  cache: BitmapCache | undefined,
  pageCount: number,
  scroller: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const root = scroller.current;
    if (!cache || !root) {
      return;
    }
    const prefetch = new Prefetch(cache, root, pageCount);
    const observer = new MutationObserver(prefetch.schedule);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-scale", "data-page-index", "class", "src"],
    });
    prefetch.schedule();
    return () => {
      observer.disconnect();
      prefetch.dispose();
    };
  }, [cache, pageCount, scroller]);
}

/**
 * The prefetch of one viewer. The PDF engine renders one thing at a time:
 * what is on screen goes first, so the prefetch waits until every page shown
 * has its full picture, and then fetches one page at a time, the nearest
 * first.
 */
class Prefetch {
  private pending: { page: number; cancel: () => void } | undefined;
  private frame = 0;

  constructor(
    private readonly cache: BitmapCache,
    private readonly root: HTMLElement,
    private readonly pageCount: number,
  ) {}

  /** Look again on the next frame. */
  readonly schedule = (): void => {
    if (!this.frame) {
      this.frame = requestAnimationFrame(this.update);
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.pending?.cancel();
  }

  private readonly update = (): void => {
    this.frame = 0;
    const pages = Array.from(
      this.root.querySelectorAll<HTMLElement>(".page[data-page-index]"),
    );
    const shown = pages.map((page) => Number(page.dataset.pageIndex));
    const range = prefetchRange(shown, this.pageCount);
    const scale = Number(pages[0]?.dataset.scale);
    if (!range || !Number.isFinite(scale)) {
      return;
    }
    this.cache.retain(range, shown);
    if (
      this.pending &&
      (this.pending.page < range[0] || this.pending.page > range[1])
    ) {
      this.pending.cancel();
      this.pending = undefined;
    }
    if (this.pending || this.drawing(pages)) {
      return;
    }
    const wanted = lowScale(scale);
    const next = [...Array(range[1] - range[0] + 1).keys()]
      .map((offset) => range[0] + offset)
      .filter(
        (page) => !shown.includes(page) && !this.cache.hasLow(page, wanted),
      )
      .sort((a, b) => distance(a, shown) - distance(b, shown))[0];
    if (next !== undefined) {
      this.fetch(next, wanted);
    }
  };

  /** Whether a page on screen still waits for its full picture. */
  private drawing(pages: HTMLElement[]): boolean {
    return (
      this.root.querySelector(".page-image-low") !== null ||
      pages.some((page) => !page.querySelector("img.page-image"))
    );
  }

  private fetch(page: number, scale: number): void {
    const entry = { page, cancel: (): void => undefined };
    this.pending = entry;
    entry.cancel = this.cache.request(
      { quality: "low", page, scale, dpr: 1 },
      () => {
        if (this.pending === entry) {
          this.pending = undefined;
        }
        this.schedule();
      },
    );
  }
}

const distance = (page: number, shown: number[]): number =>
  Math.min(...shown.map((other) => Math.abs(other - page)));

/**
 * A page's picture. It shows the low bitmap of the page at once when there is
 * one, asks for the full one at the displayed size, and swaps it in, with the
 * low one still visible until the full one has been decoded: never a blank
 * page between them. A full bitmap that is no longer wanted (another turn, a
 * zoom step) is cancelled.
 */
export function PageImage(props: {
  pageIndex: number;
  scale: number;
  dpr: number;
}): React.JSX.Element | null {
  const { full, low } = usePageBitmaps(props);
  const src = full ?? low;
  if (!src) {
    return null;
  }
  return (
    <img
      src={src}
      className={full ? "page-image" : "page-image page-image-low"}
      draggable={false}
      // Decoded with the frame it first shows in: no blank frame while it loads.
      decoding="sync"
      alt=""
    />
  );
}

interface PageRender {
  pageIndex: number;
  scale: number;
  dpr: number;
}

/** The low and full bitmap URLs of a page, as they arrive. */
function usePageBitmaps({ pageIndex, scale, dpr }: PageRender): {
  full: string | undefined;
  low: string | undefined;
} {
  const cache = useContext(BitmapContext);
  const [full, setFull] = useState<{ page: number; url: string } | undefined>(
    () => {
      const url = cache?.peek({ quality: "full", page: pageIndex, scale, dpr });
      return url ? { page: pageIndex, url } : undefined;
    },
  );
  const [low, setLow] = useState<string | undefined>(() =>
    cache?.lowOf(pageIndex),
  );
  useEffect(
    () =>
      cache &&
      requestBitmaps(
        cache,
        { pageIndex, scale, dpr },
        {
          low: setLow,
          full: (url) => setFull({ page: pageIndex, url }),
        },
      ),
    [cache, pageIndex, scale, dpr],
  );
  // The full bitmap of the previous zoom stays until the new one is decoded: it
  // is as good as the low one, and better.
  return { full: full?.page === pageIndex ? full.url : undefined, low };
}

/**
 * Ask for a page's bitmaps: a low one first when there is none yet (it
 * renders in a fraction of the time), and the full one, decoded off screen so
 * the swap does not flash. Returns the cancellation.
 */
function requestBitmaps(
  cache: BitmapCache,
  { pageIndex, scale, dpr }: PageRender,
  show: { low: (url: string | undefined) => void; full: (url: string) => void },
): () => void {
  let live = true;
  const cancels: (() => void)[] = [];
  const lowUrl = cache.lowOf(pageIndex);
  show.low(lowUrl);
  if (!lowUrl) {
    cancels.push(
      cache.request(
        { quality: "low", page: pageIndex, scale: lowScale(scale), dpr: 1 },
        (url) => live && show.low(url),
      ),
    );
  }
  cancels.push(
    cache.request({ quality: "full", page: pageIndex, scale, dpr }, (url) => {
      const image = new Image();
      image.src = url;
      const reveal = (): void => {
        if (live) {
          show.full(url);
        }
      };
      void image.decode().then(reveal, reveal);
    }),
  );
  return () => {
    live = false;
    cancels.forEach((cancel) => cancel());
  };
}

/** EmbedPDF render options; pageColors only when the pinned engine exposes it. */
function renderOptions(
  scaleFactor: number,
  dpr: number,
  pageColors: "normal" | "dark",
): Record<string, unknown> {
  const options: Record<string, unknown> = { scaleFactor, dpr };
  if (PAGE_COLORS_ENGINE_AVAILABLE && pageColors === "dark") {
    options.pageColors = {
      background: "#1e1e1e",
      text: "#e8e6e3",
      pathFill: "#e8e6e3",
      pathStroke: "#e8e6e3",
      textFill: "#e8e6e3",
      textStroke: "#e8e6e3",
    };
  }
  return options;
}
