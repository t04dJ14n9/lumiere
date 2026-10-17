import { imageControls } from "./image";

interface InspectorOptions {
  trigger: HTMLButtonElement;
  url: string;
  name: string;
  openFile(): void;
}
export function inspectImage(
  trigger: HTMLButtonElement,
  url: string,
  name: string,
  openFile: () => void,
): () => void {
  const inspector = new ImageInspector({ trigger, url, name, openFile });
  const show = (event: MouseEvent) => inspector.show(event);
  trigger.addEventListener("click", show);
  return () => {
    trigger.removeEventListener("click", show);
    inspector.close(false);
  };
}

class ImageInspector {
  private dialog?: HTMLDialogElement;
  private abort?: AbortController;
  private saved: unknown;
  constructor(private readonly options: InspectorOptions) {}

  close(restoreFocus = true): void {
    if (!this.dialog) {
      return;
    }
    this.abort?.abort();
    this.dialog.close();
    this.dialog.remove();
    delete this.dialog;
    if (restoreFocus && this.options.trigger.isConnected) {
      this.options.trigger.focus();
    }
  }

  show(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.dialog) {
      return;
    }
    this.abort = new AbortController();
    const parts = inspectorElements(this.options.name);
    this.dialog = parts.dialog;
    const { image, area, toolbar, status } = parts;
    imageControls({
      image,
      area,
      toolbar,
      status,
      saved: this.saved,
      persist: (value) => {
        this.saved = value;
      },
      signal: this.abort.signal,
    });
    this.addActions(toolbar);
    area.append(image);
    this.dialog.append(toolbar, area, status);
    document.body.append(this.dialog);
    this.bindLifetime(parts, this.abort.signal);
    image.src = this.options.url;
    this.dialog.showModal();
    area.focus();
  }

  private addActions(toolbar: HTMLElement): void {
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Open image file";
    open.onclick = () => {
      this.close();
      this.options.openFile();
    };
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Close";
    dismiss.setAttribute("aria-label", "Close image");
    dismiss.onclick = () => this.close();
    toolbar.append(open, dismiss);
  }

  private bindLifetime(
    { dialog, image, status }: ReturnType<typeof inspectorElements>,
    signal: AbortSignal,
  ): void {
    image.addEventListener(
      "error",
      () => {
        status.textContent = "Could not load this image.";
      },
      { signal },
    );
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal },
    );
    dialog.addEventListener("keydown", (event) => event.stopPropagation(), {
      signal,
    });
  }
}

function inspectorElements(name: string) {
  const dialog = document.createElement("dialog");
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
  return { dialog, toolbar, area, image, status };
}
