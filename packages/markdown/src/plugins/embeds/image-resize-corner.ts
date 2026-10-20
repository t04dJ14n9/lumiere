/**
 * Obsidian-style `.image-resize-corner` chrome on a selected Live Preview
 * image (measured in Obsidian `app.css`: 30×30 hit area, chevron `::after`).
 * Functional resize stays on `+` / `-` / `0` in `image-selection.ts`; the
 * corner is visual chrome (pointer-events none) so it does not steal clicks.
 */

const CORNER = "image-resize-corner";
const EMBED = "image-embed";
const SELECTED = "md-image-selected";

/** Hosts we tagged with `.image-embed` so deselect can undo that. */
const tagged = new WeakSet<object>();

/**
 * Mark or clear selection chrome on a rendered image: `md-image-selected`,
 * an `.image-embed` host, and a trailing `.image-resize-corner` sibling.
 */
export function setImageSelectedChrome(
  image: HTMLImageElement,
  selected: boolean,
): void {
  if (selected) {
    image.classList.add(SELECTED);
    const host = image.parentElement;
    if (!host) {
      return;
    }
    if (!host.classList.contains(EMBED)) {
      host.classList.add(EMBED);
      tagged.add(host);
    }
    if (
      ![...host.children].some((child) => child.classList.contains(CORNER))
    ) {
      const corner = document.createElement("span");
      corner.className = CORNER;
      corner.setAttribute("aria-hidden", "true");
      image.after(corner);
    }
    return;
  }

  image.classList.remove(SELECTED);
  const host = image.parentElement;
  if (!host) {
    return;
  }
  if (host.querySelector(`img.${SELECTED}`)) {
    return;
  }
  for (const child of [...host.children]) {
    if (child.classList.contains(CORNER)) {
      child.remove();
    }
  }
  if (tagged.has(host)) {
    host.classList.remove(EMBED);
    tagged.delete(host);
  }
}
