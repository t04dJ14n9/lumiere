/**
 * A rendered block's reserved height (min-height, from its estimate) and the
 * parts of it still rendering (see RENDER_PENDING_ATTRIBUTE): when the
 * reserve can go, and telling those parts their block is back in the page.
 */
import type { EditorView } from "@codemirror/view";
import {
  RENDER_PENDING_ATTRIBUTE,
  RENDER_REMOUNT_EVENT,
} from "../../plugins/render/api";
import { hasPendingRender } from "./markdown-block-height";

/**
 * Drop a block's reserved height once its content is in and it is in the
 * page, at CodeMirror's next measure: reading the block's height there
 * forces no layout of its own.
 *
 * A block renders as it is built, before CodeMirror puts it in the page, and
 * one whose content arrived meanwhile (a formula, a cached diagram, or a
 * diagram drawn while it was scrolled out) gets no later chance, so every
 * mount asks, as does every part that finishes rendering. A diagram still
 * waiting for its SVG keeps the reserve: the source shown meanwhile is far
 * shorter than the diagram, and the block would shrink and grow back under
 * the reader.
 */
export function releaseReserveOnceMounted(
  view: EditorView,
  shell: HTMLElement,
  body: HTMLElement,
): void {
  // `style` is missing only on the stand-in elements of unit tests, as in
  // MarkdownBlock's createShell.
  if (!shell.style?.minHeight) {
    return;
  }
  view.requestMeasure({
    key: shell,
    read: () =>
      shell.isConnected &&
      !hasPendingRender(body) &&
      body.getBoundingClientRect().height > 0,
    write: (isComplete, view) => {
      if (isComplete) {
        shell.style.minHeight = "";
        // Measure again in this frame, so CodeMirror holds the text still
        // before the new height is painted, not a frame after.
        view.requestMeasure(MEASURE_AGAIN);
      }
    },
  });
}

const MEASURE_AGAIN = { key: "markdown-block-reserve", read: () => {} };

/** Tell parts still rendering that their block is back (see RENDER_REMOUNT_EVENT). */
export function announceRemount(body: HTMLElement): void {
  for (const element of body.querySelectorAll?.(
    `[${RENDER_PENDING_ATTRIBUTE}]`,
  ) ?? []) {
    element.dispatchEvent(new Event(RENDER_REMOUNT_EVENT));
  }
}
