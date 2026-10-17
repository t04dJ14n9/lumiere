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
  const cache = useMemo(
    () =>
      provides
        ? new BitmapCache(
            (pageIndex, scaleFactor, dpr) =>
              provides.forDocument(DOCUMENT_ID).renderPage({
                pageIndex,
                options: { scaleFactor, dpr },
              }) as unknown as RenderTask,
            urls,
          )
        : undefined,
    [provides],
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
    let pending: { page: number; cancel: () => void } | undefined;
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const pages = Array.from(
        root.querySelectorAll<HTMLElement>(".page[data-page-index]"),
      );
      const shown = pages.map((page) => Number(page.dataset.pageIndex));
      const range = prefetchRange(shown, pageCount);
      const scale = Number(pages[0]?.dataset.scale);
      if (!range || !Number.isFinite(scale)) {
        return;
      }
      cache.retain(range, shown);
      if (pending && (pending.page < range[0] || pending.page > range[1])) {
        pending.cancel();
        pending = undefined;
      }
      // The PDF engine renders one thing at a time: what is on screen goes first,
      // so the prefetch waits until every page shown has its full picture, and
      // then fetches one page at a time, the nearest first.
      if (
        pending ||
        root.querySelector(".page-image-low") ||
        pages.some((page) => !page.querySelector("img.page-image"))
      ) {
        return;
      }
      const wanted = lowScale(scale);
      const next = [...Array(range[1] - range[0] + 1).keys()]
        .map((offset) => range[0] + offset)
        .filter((page) => !shown.includes(page) && !cache.hasLow(page, wanted))
        .sort((a, b) => distance(a, shown) - distance(b, shown))[0];
      if (next === undefined) {
        return;
      }
      const entry = { page: next, cancel: (): void => undefined };
      pending = entry;
      entry.cancel = cache.request(
        { quality: "low", page: next, scale: wanted, dpr: 1 },
        () => {
          if (pending === entry) {
            pending = undefined;
          }
          schedule();
        },
      );
    };
    const schedule = (): void => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-scale", "data-page-index", "class", "src"],
    });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      pending?.cancel();
    };
  }, [cache, pageCount, scroller]);
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
export function PageImage({
  pageIndex,
  scale,
  dpr,
}: {
  pageIndex: number;
  scale: number;
  dpr: number;
}): React.JSX.Element | null {
  const cache = useContext(BitmapContext);
  const [full, setFull] = useState<{ page: number; url: string } | undefined>(
    () => {
      const url = cache?.peek({
        quality: "full",
        page: pageIndex,
        scale: scale,
        dpr: dpr,
      });
      return url ? { page: pageIndex, url } : undefined;
    },
  );
  const [low, setLow] = useState<string | undefined>(() =>
    cache?.lowOf(pageIndex),
  );

  useEffect(() => {
    if (!cache) {
      return;
    }
    let live = true;
    const cancels: (() => void)[] = [];
    const lowUrl = cache.lowOf(pageIndex);
    setLow(lowUrl);
    // Without a low bitmap (a page the prefetch has not reached yet) ask for one
    // first: it renders in a fraction of the time.
    if (!lowUrl) {
      cancels.push(
        cache.request(
          { quality: "low", page: pageIndex, scale: lowScale(scale), dpr: 1 },
          (url) => live && setLow(url),
        ),
      );
    }
    cancels.push(
      cache.request(
        { quality: "full", page: pageIndex, scale: scale, dpr: dpr },
        (url) => {
          // Decode it off screen first, so the swap does not flash.
          const image = new Image();
          image.src = url;
          const show = (): void => {
            if (live) {
              setFull({ page: pageIndex, url });
            }
          };
          void image.decode().then(show, show);
        },
      ),
    );
    return () => {
      live = false;
      cancels.forEach((cancel) => cancel());
    };
  }, [cache, pageIndex, scale, dpr]);

  // The full bitmap of the previous zoom stays until the new one is decoded: it
  // is as good as the low one, and better.
  const shownFull = full?.page === pageIndex ? full.url : undefined;
  const src = shownFull ?? low;
  if (!src) {
    return null;
  }
  return (
    <img
      src={src}
      className={shownFull ? "page-image" : "page-image page-image-low"}
      draggable={false}
      // Decoded with the frame it first shows in: no blank frame while it loads.
      decoding="sync"
      alt=""
    />
  );
}
