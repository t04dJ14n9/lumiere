import { ZoomMode, useZoom, type ZoomLevel } from "@embedpdf/plugin-zoom/react";
import { useEffect, useRef } from "react";
import {
  parseReadingPosition,
  type ReadingPosition,
} from "../shared/reading-position";
import {
  parseViewSettings,
  type ViewSettings,
  type ZoomChoice,
} from "../shared/view-settings";
import type { Navigation } from "./navigation";
import { DOCUMENT_ID } from "./plugins";
import {
  restoredZoomReady,
  restoreWhenZoomReady,
} from "../shared/restored-zoom";

let settings = parseViewSettings(undefined);
let last: ReadingPosition | undefined;

/** Prepare defaults before plugins start. A rebuilt file keeps the current panel's position. */
export function prepareReadingPosition(
  defaults: unknown,
  saved: unknown,
): void {
  settings = parseViewSettings(defaults);
  last = last ??
    parseReadingPosition(saved) ?? {
      page: 1,
      top: 0,
      left: 0,
      zoom: settings.defaultZoom,
      pageLayout: settings.pageLayout,
      scrollMode: settings.scrollMode,
      scrollDirection: settings.scrollDirection,
    };
}

export function currentViewSettings(): ViewSettings {
  return settings;
}

export function rememberViewSettings(value: unknown): ViewSettings {
  settings = parseViewSettings(value);
  return settings;
}

export function rememberPosition(position: ReadingPosition): void {
  last = position;
}

export function rememberedPosition(): ReadingPosition {
  return (
    last ?? {
      page: 1,
      top: 0,
      left: 0,
      zoom: settings.defaultZoom,
      ...settings,
    }
  );
}

export function nativeZoom(choice: ZoomChoice): ZoomLevel {
  return choice === "fitWidth"
    ? ZoomMode.FitWidth
    : choice === "fitPage"
      ? ZoomMode.FitPage
      : choice === "actual"
        ? 1
        : choice / 100;
}

/** The automatic zoom the plugin starts in: the restored fit mode, else fit width. */
export function autoZoom(choice: ZoomChoice): ZoomLevel {
  return choice === "fitPage" ? ZoomMode.FitPage : ZoomMode.FitWidth;
}

/** Initial restoration uses native coordinates and bypasses motion. Later reports retain changes. */
export function useRestorePosition(
  navigation: Navigation,
  pageCount: number,
): void {
  const restoring = useRef(rememberedPosition());
  const token = useRef(navigation.intent.current());
  const intent = navigation.intent;
  const restore = navigation.restore;
  const latestNavigation = useRef(navigation);
  latestNavigation.current = navigation;
  const { provides: zoom } = useZoom(DOCUMENT_ID);
  useEffect(() => {
    if (!intent.owns(token.current)) {
      return;
    }
    const position = {
      ...restoring.current,
      page: Math.min(restoring.current.page, pageCount),
    };
    const choice = position.zoom;
    if (!zoom) {
      return;
    }
    if (choice === "fitWidth" || choice === "fitPage") {
      restore(position);
      return;
    }
    // The zoom plugin may still be settling into its automatic zoom when the
    // document appears, and on a slow machine that can take many frames: ask
    // again whenever the request did not stick, and place the reader at the
    // saved offsets once the numeric request has held after layout is ready.
    // The plugin starts at scale 1 even in FitWidth mode, and ignores requests
    // while viewport metrics are zero. That default must not count as success.
    const target = nativeZoom(choice) as number;
    zoom.requestZoom(target);
    return restoreWhenZoomReady({
      ownsIntent: () => intent.owns(token.current),
      ready: () => {
        const state = zoom.getState();
        return restoredZoomReady(
          latestNavigation.current.isReady(),
          state.zoomLevel,
          state.currentZoomLevel,
          target,
        );
      },
      requestZoom: () => {
        const state = zoom.getState();
        if (
          latestNavigation.current.isReady() &&
          (typeof state.zoomLevel !== "number" ||
            Math.abs(state.zoomLevel - target) > 0.001)
        ) {
          zoom.requestZoom(target);
        }
      },
      restore: () => restore(position),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (frame) => cancelAnimationFrame(frame),
    });
    // Restore once per document: later zoom or layout changes are the reader's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restore, pageCount, Boolean(zoom), intent]);
}
