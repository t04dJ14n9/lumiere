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
 * Drop the reserved height once the content is in. A diagram still waiting
 * for its SVG keeps it: the source shown meanwhile (or its highlighting
 * finishing) is far shorter than the diagram, and releasing the reserve
 * then made the block shrink and grow back under the reader.
 */
export function releasePaintReserve(
  shell: HTMLElement,
  body: HTMLElement,
): void {
  if (hasPendingRender(body)) {
    return;
  }
  if (
    shell.style.minHeight &&
    shell.isConnected &&
    body.getBoundingClientRect().height > 0
  ) {
    shell.style.minHeight = "";
  }
}

/**
 * A block whose content arrived while it was out of the page (a diagram
 * drawn as it was scrolled past) still holds its reserve, which can leave a
 * gap below the diagram once it is back; drop it at CodeMirror's next
 * measure.
 */
export function releaseReserveOnceMounted(
  view: EditorView,
  shell: HTMLElement,
  body: HTMLElement,
): void {
  if (!shell.style.minHeight) {
    return;
  }
  view.requestMeasure({
    read: () =>
      shell.isConnected &&
      !hasPendingRender(body) &&
      body.getBoundingClientRect().height > 0,
    write: (isComplete) => {
      if (isComplete) {
        shell.style.minHeight = "";
      }
    },
  });
}

/** Tell parts still rendering that their block is back (see RENDER_REMOUNT_EVENT). */
export function announceRemount(body: HTMLElement): void {
  for (const element of body.querySelectorAll?.(
    `[${RENDER_PENDING_ATTRIBUTE}]`,
  ) ?? []) {
    element.dispatchEvent(new Event(RENDER_REMOUNT_EVENT));
  }
}
