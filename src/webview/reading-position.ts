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
  const restore = navigation.restore;
  const { provides: zoom } = useZoom(DOCUMENT_ID);
  useEffect(() => {
    const choice = restoring.current.zoom;
    if (zoom && choice !== "fitWidth" && choice !== "fitPage") {
      zoom.requestZoom(nativeZoom(choice));
    }
    restore({
      ...restoring.current,
      page: Math.min(restoring.current.page, pageCount),
    });
  // Restore once per document: later zoom or layout changes are the reader's.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restore, pageCount, Boolean(zoom)]);
}
