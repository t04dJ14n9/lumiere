/**
 * Obsidian `.embed-actions` / `.embed-action` chrome for image embeds
 * (REA `app.css` ~3891 / ~11776 / ~12035): frosted bar, top-end, hover +
 * selected opacity. VS Code theme tokens; inspect stays the action.
 */

/** Host class Obsidian puts on image embeds (also anchors resize-corner). */
export const IMAGE_EMBED = "image-embed";

/**
 * Wrap an inspect control in `.embed-actions` and tag the image host as
 * `.image-embed`. Returns the actions element (remove on dispose).
 */
export function mountImageEmbedActions(
  image: HTMLImageElement,
  host: HTMLElement,
  inspect: HTMLButtonElement,
): HTMLElement {
  host.classList.add(IMAGE_EMBED);
  inspect.classList.add("embed-action");
  if (!inspect.classList.contains("inspect-image")) {
    inspect.classList.add("inspect-image");
  }
  const actions = document.createElement("div");
  actions.className = "embed-actions";
  actions.append(inspect);
  image.after(actions);
  return actions;
}
