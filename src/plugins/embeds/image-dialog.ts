import { imageControls } from "./image";

export function inspectImage(
  trigger: HTMLButtonElement,
  url: string,
  name: string,
  openFile: () => void,
): () => void {
  let dialog: HTMLDialogElement | undefined,
    abort: AbortController | undefined,
    saved: unknown;
  const close = (restoreFocus = true): void => {
    if (!dialog) {
      return;
    }
    abort?.abort();
    dialog.close();
    dialog.remove();
    dialog = undefined;
    if (restoreFocus && trigger.isConnected) {
      trigger.focus();
    }
  };
  const show = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (dialog) {
      return;
    }
    abort = new AbortController();
    dialog = document.createElement("dialog");
    dialog.className = "image-inspector";
    dialog.setAttribute("aria-label", `Image: ${name}`);
    const toolbar = document.createElement("nav");
    toolbar.setAttribute("aria-label", "Image controls");
    const area = document.createElement("section");
    area.className = "media-area";
    area.setAttribute("aria-label", name);
    const image = document.createElement("img");
    image.alt = name;
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-label", "Image status");
    status.textContent = "Loading image…";
    imageControls(
      image,
      area,
      toolbar,
      status,
      saved,
      (value) => {
        saved = value;
      },
      abort.signal,
    );
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Open image file";
    open.onclick = () => {
      close();
      openFile();
    };
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Close";
    dismiss.setAttribute("aria-label", "Close image");
    dismiss.onclick = () => close();
    toolbar.append(open, dismiss);
    area.append(image);
    dialog.append(toolbar, area, status);
    document.body.append(dialog);
    image.addEventListener(
      "error",
      () => {
        status.textContent = "Could not load this image.";
      },
      { signal: abort.signal },
    );
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        close();
      },
      { signal: abort.signal },
    );
    dialog.addEventListener("keydown", (event) => event.stopPropagation(), {
      signal: abort.signal,
    });
    image.src = url;
    dialog.showModal();
    area.focus();
  };
  trigger.addEventListener("click", show);
  return () => {
    trigger.removeEventListener("click", show);
    close(false);
  };
}
