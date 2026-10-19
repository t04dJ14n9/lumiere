import { randomUUID } from "node:crypto";

/**
 * A temporary id for one PDF pane. It is not a file path and not a
 * `#page=` / `viewrect` locator: the same PDF can be open in two panes,
 * and this id dies with the pane.
 */
export function createPdfViewId(): string {
  return `pdf:${randomUUID()}`;
}
