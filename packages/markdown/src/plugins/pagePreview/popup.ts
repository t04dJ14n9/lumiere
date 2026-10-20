/** Obsidian `--popover-height` (REA app.css). */
export const POPOVER_HEIGHT = 400;

interface PopupActions {
  href: string;
  open(): void;
  close(): void;
}

/** Popup DOM and viewport placement, independent of resource loading. */
export function createPreviewPopup(actions: PopupActions): {
  popup: HTMLElement;
  body: HTMLElement;
  open: HTMLButtonElement;
} {
  const popup = document.createElement("aside");
  // Obsidian uses `.popover.hover-popover`; keep `link-preview` for existing CSS.
  popup.className = "link-preview popover hover-popover";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Link preview");
  const label = previewLabel(actions.href);
  const open = iconButton("↗", `Open ${label}`, actions.open);
  const dismiss = iconButton("×", "Close link preview", actions.close);
  const toolbar = document.createElement("div");
  toolbar.className = "link-preview-actions";
  toolbar.append(open, dismiss);
  const body = document.createElement("div");
  body.className = "link-preview-body";
  body.textContent = "Loading…";
  popup.append(toolbar, body);
  return { popup, body, open };
}

/** A small icon button in the card's corner, named for screen readers. */
function iconButton(
  icon: string,
  label: string,
  run: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-preview-action";
  button.textContent = icon;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.onclick = run;
  return button;
}

export function mountPreviewPopup(
  root: HTMLElement,
  link: HTMLElement,
  elements: { popup: HTMLElement; open: HTMLButtonElement },
  keyboard: boolean,
): void {
  const { popup, open } = elements;
  root.append(popup);
  if (keyboard) {
    open.focus();
  }
  const bounds = link.getBoundingClientRect();
  popup.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - popup.offsetWidth - 8))}px`;
  popup.style.top = `${Math.max(8, Math.min(bounds.bottom + 6, innerHeight - (POPOVER_HEIGHT + 8)))}px`;
}

export function previewLabel(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  } // Keep invalid escapes visible for the resolver error.
}

/** Obsidian `.mod-empty` centred muted status (missing note, errors, prompts). */
export function setPreviewBody(
  body: HTMLElement,
  text: string,
  kind: "loading" | "empty" | "ready" = "ready",
): void {
  void body.replaceChildren();
  body.textContent = text;
  body.classList.toggle("mod-empty", kind === "empty");
}
