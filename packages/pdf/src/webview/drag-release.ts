import { useEffect } from "react";

/**
 * Finish a drag whose button was released outside the viewer.
 *
 * VS Code shows the viewer in an iframe; a button released over the rest of
 * the window never reaches it, so EmbedPDF's region (or text) drag went on
 * following the pointer until the next click. When the pointer comes back
 * with no button held, end the drag where the viewer last saw it.
 */
export function useEndDragsReleasedOutside(): void {
  useEffect(() => {
    let dragging: PointerEvent | undefined;
    const onDown = (event: PointerEvent): void => {
      if (event.button === 0) {
        dragging = event;
      }
    };
    const onMove = (event: PointerEvent): void => {
      if (!dragging) {
        return;
      }
      if (event.buttons !== 0) {
        dragging = event;
        return;
      }
      const last = dragging;
      dragging = undefined;
      const target =
        last.target instanceof Element && last.target.isConnected
          ? last.target
          : document.elementFromPoint(last.clientX, last.clientY);
      target?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: last.clientX,
          clientY: last.clientY,
          pointerId: last.pointerId,
          pointerType: last.pointerType,
          isPrimary: last.isPrimary,
          button: 0,
          buttons: 0,
        }),
      );
    };
    const onUp = (): void => {
      dragging = undefined;
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
    };
  }, []);
}
