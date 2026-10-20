import { embedsImage } from "../../markdown/images";
import { mediaKind } from "../../shared/media-kinds";
import { parseVideoUrl } from "../onlineVideos/api";
import { embedsNote } from "./clicks";
import { writtenHeight, writtenWidth } from "./image-size";

/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line (~24px). Image embeds are often a single source
 * line but hundreds of pixels tall (Obsidian `|W` / `|WxH` size, or natural
 * dimensions after load). Off-viewport rebuilds then collapse the height map
 * the same way tall Properties / tables do.
 *
 * Prefer an explicit `|WxH` height; otherwise reserve a stable default so
 * PageDown / click coordinates below the embed stay valid until measure runs.
 *
 * YouTube / Bilibili image links become `.mw-video` cards (16:9 thumb ≈200px
 * wide). Without a dedicated reserve they fall through to CARD_DEFAULT (~64px).
 */
const CHROME = 16;
/** Portrait / unknown images without `|WxH` — better than one line. */
const IMAGE_DEFAULT = 240;
/** `<video>` / `<audio>` controls chrome before metadata. */
const MEDIA_DEFAULT = 180;
/**
 * Online video card with cover: thumb flex-basis 200px at 16:9 (~112px) plus
 * title/meta/actions. Stacked layout in a narrow pane is taller; 200 covers
 * both until measure. Playing frames (Bilibili opt-in) grow further via measure.
 */
const ONLINE_VIDEO_DEFAULT = 200;
/** PDF and other attachment cards. */
const CARD_DEFAULT = 48;
/** Note embeds: content unknown until resolve; keep a modest reserve. */
const NOTE_DEFAULT = 120;

function embedTarget(source: string): string {
  return (
    /^!\[\[([^\]|#^]*)/u.exec(source)?.[1] ??
    /^!\[[^\]]*\]\(\s*<?([^)>\s]*)/u.exec(source)?.[1] ??
    ""
  ).trim();
}

/** Reserve embed height from Markdown source before the DOM is measured. */
export function embedEstimatedHeight(source: string): number {
  if (!source) {
    return IMAGE_DEFAULT + CHROME;
  }
  if (embedsImage(source)) {
    const height = writtenHeight(source);
    if (height !== undefined) {
      return height + CHROME;
    }
    const width = writtenWidth(source);
    // Width-only size: Obsidian writes `|100` for display width; height waits
    // on natural aspect. Reserve at least the default, and not less than a
    // conservative square of that width capped so landscape stays modest.
    if (width !== undefined) {
      return (
        Math.max(IMAGE_DEFAULT, Math.min(width, IMAGE_DEFAULT * 2)) + CHROME
      );
    }
    return IMAGE_DEFAULT + CHROME;
  }
  if (embedsNote(source)) {
    return NOTE_DEFAULT + CHROME;
  }
  // Online Videos replaces matching image URLs with tall cards.
  if (parseVideoUrl(embedTarget(source))) {
    return ONLINE_VIDEO_DEFAULT + CHROME;
  }
  const kind = mediaKind(embedTarget(source));
  if (kind === "audio" || kind === "video") {
    return MEDIA_DEFAULT + CHROME;
  }
  return CARD_DEFAULT + CHROME;
}
