import { SpreadMode } from "@embedpdf/plugin-spread";
import type { PageLayout } from "../shared/view-settings";

/** Native odd spreads start with 1–2; even spreads leave page 1 alone. */
export function nativeSpread(pageLayout: PageLayout): SpreadMode {
  switch (pageLayout) {
    case "single":
      return SpreadMode.None;
    case "spread":
      return SpreadMode.Odd;
    case "spreadCover":
      return SpreadMode.Even;
  }
}
