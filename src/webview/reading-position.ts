import { ZoomMode, type ZoomLevel } from "@embedpdf/plugin-zoom/react";
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

/** Initial restoration uses native coordinates and bypasses motion. Later reports retain changes. */
export function useRestorePosition(
  navigation: Navigation,
  pageCount: number,
): void {
  const restoring = useRef(rememberedPosition());
  const restore = navigation.restore;
  useEffect(() => {
    restore({
      ...restoring.current,
      page: Math.min(restoring.current.page, pageCount),
    });
  }, [restore, pageCount]);
}
