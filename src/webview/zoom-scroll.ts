import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import { useEffect, type RefObject } from "react";
import { DOCUMENT_ID } from "./plugins";

/** Frames a zoom step waits for the pages to be laid out at the new scale. */
const SETTLE_FRAMES = 20;

/**
 * Keep what a zoom step is anchored on (the viewer's centre, the pointer) where
 * it was. EmbedPDF scrolls to the anchor the moment it asks for the new scale,
 * but the pages only grow after React has laid them out: a page that becomes
 * wider than the viewer has no room to scroll to yet, and the browser clamps the
 * scroll to 0. This scrolls to the same place again once the room is there.
 *
 * It only finishes what the zoom step started: as soon as anything else has
 * scrolled the viewer (a jump to a page, the wheel, a key), it stops, or it
 * would drag the viewer back to where the zoom step wanted it.
 */
export function useZoomScrollSettle(container: RefObject<HTMLElement | null>): void {
  const { provides } = useZoomCapability();
  useEffect(() => {
    const zoom = provides?.forDocument(DOCUMENT_ID);
    if (!zoom) return;
    let frame = 0;
    const unsubscribe = zoom.onZoomChange(event => {
      cancelAnimationFrame(frame);
      let frames = 0;
      /** Where this settle last left the viewer; elsewhere means someone else scrolled it. */
      let placed: { left: number; top: number } | undefined;
      const settle = (): void => {
        const viewport = container.current?.querySelector<HTMLElement>('.viewport');
        if (!viewport) return;
        if (placed && (Math.abs(viewport.scrollLeft - placed.left) > 1 || Math.abs(viewport.scrollTop - placed.top) > 1)) return;
        const left = Math.min(event.desiredScrollLeft, Math.max(0, viewport.scrollWidth - viewport.clientWidth));
        const top = Math.min(event.desiredScrollTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight));
        const room = left >= event.desiredScrollLeft - 1 && top >= event.desiredScrollTop - 1;
        if (Math.abs(viewport.scrollLeft - left) > 1 || Math.abs(viewport.scrollTop - top) > 1) {
          viewport.scrollTo({ left, top, behavior: 'instant' });
        }
        placed = { left: viewport.scrollLeft, top: viewport.scrollTop };
        if (!room && ++frames < SETTLE_FRAMES) frame = requestAnimationFrame(settle);
      };
      frame = requestAnimationFrame(settle);
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [container, provides]);
}
