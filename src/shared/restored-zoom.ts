/** A matching default scale is not proof that a numeric zoom request was accepted. */
export function restoredZoomReady(
  layoutReady: boolean,
  zoomLevel: unknown,
  currentZoomLevel: number,
  target: number,
): boolean {
  return layoutReady && typeof zoomLevel === 'number'
    && Math.abs(zoomLevel - target) <= 0.001
    && Math.abs(currentZoomLevel - target) <= 0.001;
}

/** Keep waiting for late layout, but never replay over a newer user intent. */
export function restoreWhenZoomReady(options: {
  ready(): boolean;
  ownsIntent(): boolean;
  requestZoom(): void;
  restore(): void;
  requestFrame(callback: () => void): number;
  cancelFrame(frame: number): void;
}): () => void {
  let steady = 0;
  let cancelled = false;
  let frame = options.requestFrame(function settle() {
    if (cancelled || !options.ownsIntent()) return;
    if (!options.ready()) {
      steady = 0;
      options.requestZoom();
    } else {
      steady++;
    }
    if (steady < 3) frame = options.requestFrame(settle);
    else options.restore();
  });
  return () => { cancelled = true; options.cancelFrame(frame); };
}
