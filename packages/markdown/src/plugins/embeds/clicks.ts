import type { BlockEditing } from "../../webview/ui/markdown-widget";
import type { InlineClick } from "../../webview/ui/inline-widget";
import { embedsImage } from "../../markdown/images";

export { embedsImage };

/**
 * Whether an embed shows a note, rather than an image, audio, video, a PDF,
 * another file or a web address: its target has no extension, or `.md`.
 */
export function embedsNote(source: string): boolean {
  const target = (
    /^!\[\[([^\]|#^]*)/u.exec(source)?.[1] ??
    /^!\[[^\]]*\]\(\s*<?([^)>\s]*)/u.exec(source)?.[1] ??
    ""
  ).trim();
  if (/^[a-z][a-z\d+.-]*:/iu.test(target)) {
    return false;
  }
  const extension = /\.([^./]+)$/u.exec(target)?.[1]?.toLowerCase();
  return extension === undefined || extension === "md";
}

/**
 * A click on an embedded note selects its source, as in Obsidian (links
 * inside it still open). An image has no Edit button: its keys edit it
 * (`image-selection.ts`). Other embeds keep clicks for their content and
 * reveal from their Edit button.
 */
export function embedEditing(source: string): BlockEditing {
  if (embedsNote(source)) {
    return { reveal: "click" };
  }
  return { reveal: embedsImage(source) ? "none" : "button" };
}

const SELECT_ALL: InlineClick = {
  select: (source) => ({ from: 0, to: source.length }),
};

/** The same in a line of text; a click on an image leaves the caret alone. */
export function inlineEmbedClick(source: string): InlineClick {
  return embedsNote(source) ? SELECT_ALL : "none";
}
