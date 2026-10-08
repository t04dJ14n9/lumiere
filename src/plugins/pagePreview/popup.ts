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
  popup.className = "link-preview";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Link preview");
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = `Open ${previewLabel(actions.href)}`;
  open.onclick = actions.open;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Close";
  dismiss.setAttribute("aria-label", "Close link preview");
  dismiss.onclick = actions.close;
  const body = document.createElement("div");
  body.textContent = "Loading…";
  popup.append(open, dismiss, body);
  return { popup, body, open };
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
  popup.style.top = `${Math.max(8, Math.min(bounds.bottom + 6, innerHeight - 350))}px`;
}

export function previewLabel(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  } // Keep invalid escapes visible for the resolver error.
}
