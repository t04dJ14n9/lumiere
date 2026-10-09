import { useEffect, type RefObject } from 'react';

const BUTTON_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup'] as const;

/**
 * Keep right (and middle) clicks on the pages away from EmbedPDF.
 *
 * EmbedPDF starts a text or region drag on any button. A right-click opens
 * VS Code's context menu, which takes the button release, so the drag never
 * ended: the selection was gone before the menu could act on it, and later
 * drags stopped working. The context menu itself still opens.
 */
export function useIgnoreSecondaryButtons(area: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const stop = (event: MouseEvent): void => {
      if (event.button !== 0) event.stopPropagation();
    };
    for (const type of BUTTON_EVENTS) element.addEventListener(type, stop, true);
    return () => {
      for (const type of BUTTON_EVENTS) element.removeEventListener(type, stop, true);
    };
  }, [area]);
}
