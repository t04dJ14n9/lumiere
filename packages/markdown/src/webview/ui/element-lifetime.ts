/**
 * What to undo when a widget's element leaves the page.
 *
 * CodeMirror keeps a widget's element when an edit elsewhere rebuilds an
 * equal widget (`eq`), and later calls `destroy` on that newer widget. So
 * cleanup kept on the widget that built the element is lost, and with it
 * listeners, observers and render passes. Keep it by element instead:
 * register it in `toDOM` and run it in `destroy`, whichever widget that is.
 */
const lifetimes = new WeakMap<Element, () => void>();

/** Run `cleanup` when `element` is destroyed; replaces an earlier one. */
export function untilDestroyed(element: Element, cleanup: () => void): void {
  lifetimes.set(element, cleanup);
}

/** Run and forget `element`'s cleanup, if it has one. */
export function destroyElement(element: Element): void {
  const cleanup = lifetimes.get(element);
  lifetimes.delete(element);
  cleanup?.();
}
