/**
 * A rendered block's reserved height (min-height, from its estimate) and the
 * parts of it still rendering (see RENDER_PENDING_ATTRIBUTE): when the
 * reserve can go, and telling those parts their block is back in the page.
 */
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

/** Tell parts still rendering that their block is back (see RENDER_REMOUNT_EVENT). */
export function announceRemount(body: HTMLElement): void {
  for (const element of body.querySelectorAll?.(
    `[${RENDER_PENDING_ATTRIBUTE}]`,
  ) ?? []) {
    element.dispatchEvent(new Event(RENDER_REMOUNT_EVENT));
  }
}
