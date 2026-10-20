import type { RenderPass, RenderService } from "../render/api";
import type { Resources } from "../resources/api";
import { renderPreview } from "./content";
import { createPreviewPopup, mountPreviewPopup, setPreviewBody } from "./popup";

export interface PreviewContext {
  resources: Resources;
  render: RenderService;
  open(href: string, source?: string, wiki?: boolean): void;
}
export function canPreview(href: string): boolean {
  return Boolean(href) && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);
}
export function linkPreviews(
  root: HTMLElement,
  context: () => PreviewContext,
  restoreFocus?: () => void,
): { dispose(): void; refresh(): void; close(): void } {
  return new LinkPreviews(root, context, restoreFocus);
}

/** Hover/focus lifetime and asynchronous ownership for one editor's preview. */
class LinkPreviews {
  private readonly abort = new AbortController();
  private hovered: HTMLElement | null = null;
  private shown: HTMLElement | null = null;
  private popup?: HTMLElement;
  private body?: HTMLElement;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private renderedPass?: RenderPass;
  private reload?: () => void;

  constructor(
    private readonly root: HTMLElement,
    private readonly context: () => PreviewContext,
    private readonly restoreFocus?: () => void,
  ) {
    this.registerHover();
    this.registerKeyboard();
    this.registerFocus();
  }

  close(): void {
    const focused = this.popup?.contains(document.activeElement);
    clearTimeout(this.timer);
    // A closed or replaced popup cannot acquire a late resource/render result.
    this.generation++;
    this.shown = null;
    delete this.reload;
    if (this.body) {
      void this.renderedPass?.dispose();
      delete this.renderedPass;
    }
    this.popup?.remove();
    delete this.popup;
    delete this.body;
    if (focused && document.hasFocus()) {
      this.restoreFocus?.();
    }
  }

  private async show(link: HTMLElement, keyboard = false): Promise<void> {
    const href = link.dataset.href ?? link.getAttribute("href");
    if (!href || !canPreview(href)) {
      return;
    }
    if (this.shown === link) {
      if (keyboard) {
        this.popup?.querySelector<HTMLButtonElement>("button")?.focus();
      }
      return;
    }
    this.close();
    this.shown = link;
    const base = this.context();
    const source =
      link.closest<HTMLElement>("[data-note-source]")?.dataset.noteSource;
    const elements = createPreviewPopup({
      href,
      open: () => {
        base.open(
          href,
          source,
          link.dataset.wiki === "true" ||
            link.classList.contains("internal-link"),
        );
        this.close();
      },
      close: () => this.close(),
    });
    this.popup = elements.popup;
    this.body = elements.body;
    // Focus handlers must see the popup before opening it moves focus.
    mountPreviewPopup(this.root, link, elements, keyboard);
    const wiki =
      link.dataset.wiki === "true" || link.classList.contains("internal-link");
    this.reload = () => {
      void this.load(base, href, source, wiki);
    };
    await this.load(base, href, source, wiki);
  }

  private async load(
    base: PreviewContext,
    href: string,
    source: string | undefined,
    wiki: boolean,
  ): Promise<void> {
    const request = ++this.generation;
    if (this.body) {
      void this.renderedPass?.dispose();
      delete this.renderedPass;
      setPreviewBody(this.body, "Loading…", "loading");
    }
    try {
      const resource = await base.resources.load(
        href,
        source,
        wiki ? "wikilink" : "markdown",
      );
      if (!this.body || request !== this.generation) {
        return;
      }
      if (!resource) {
        setPreviewBody(this.body, "No preview available", "empty");
        return;
      }
      this.body.classList.remove("mod-empty");
      const next = await renderPreview({
        body: this.body,
        resource,
        href,
        ...(source === undefined ? {} : { source }),
        wiki,
        render: base.render,
      });
      if (request !== this.generation) {
        await next?.dispose();
      } else if (next) {
        this.renderedPass = next;
      } else {
        // Attachment prompt already wrote body text; mark Obsidian empty chrome.
        this.body.classList.add("mod-empty");
        delete this.renderedPass;
      }
    } catch (error) {
      if (this.body && request === this.generation) {
        const message =
          error instanceof Error ? error.message : String(error);
        setPreviewBody(
          this.body,
          message.replace(/^Error:\s*/i, "") || "No preview available",
          "empty",
        );
      }
    }
  }

  private registerHover(): void {
    const options = { signal: this.abort.signal };
    this.root.addEventListener(
      "mousemove",
      (event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("a[href], [data-href]")
            : null;
        if (target !== this.hovered) {
          clearTimeout(this.timer);
          this.hovered = target;
        }
        if (
          target &&
          (event.metaKey || event.ctrlKey) &&
          this.shown !== target
        ) {
          this.scheduleShow(target);
        }
      },
      options,
    );
    document.addEventListener(
      "mouseover",
      (event) => this.mouseOver(event),
      options,
    );
  }

  private mouseOver(event: MouseEvent): void {
    if (document.querySelector(".image-inspector[open]")) {
      clearTimeout(this.timer);
      return;
    }
    const target = event.target as Node;
    if (this.popup?.contains(target) || this.hovered?.contains(target)) {
      clearTimeout(this.timer);
      return;
    }
    clearTimeout(this.timer);
    this.hovered = null;
    if (this.popup) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.close(), 200);
    }
  }

  private registerKeyboard(): void {
    document.addEventListener("keydown", (event) => this.keyDown(event), {
      signal: this.abort.signal,
      capture: true,
    });
    document.addEventListener(
      "keyup",
      (event) => {
        if ((event.key === "Control" || event.key === "Meta") && !this.popup) {
          clearTimeout(this.timer);
        }
      },
      { signal: this.abort.signal },
    );
  }

  private keyDown(event: KeyboardEvent): void {
    if (insideImageInspector(event.target)) {
      return;
    }
    if (event.key === "Escape" && this.popup) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
    if (event.altKey && event.key === "Enter") {
      this.showSelectedLink(event);
    }
    if ((event.key === "Control" || event.key === "Meta") && this.hovered) {
      this.scheduleShow(this.hovered);
    }
  }

  private showSelectedLink(event: KeyboardEvent): void {
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }
    const node = window.getSelection()?.anchorNode;
    const target = (
      node instanceof Element ? node : node?.parentElement
    )?.closest<HTMLElement>("a[href], [data-href]");
    if (target && this.root.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      void this.show(target, true);
    }
  }

  private scheduleShow(link: HTMLElement): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.show(link);
    }, 300);
  }

  private registerFocus(): void {
    const options = { signal: this.abort.signal };
    window.addEventListener("blur", () => this.close(), options);
    document.addEventListener(
      "focusin",
      (event) => {
        if (insideImageInspector(event.target)) {
          return;
        }
        if (this.popup && !this.popup.contains(event.target as Node)) {
          this.close();
        }
      },
      options,
    );
  }

  dispose(): void {
    this.abort.abort();
    this.close();
  }
  refresh(): void {
    this.reload?.();
  }
}

function insideImageInspector(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(".image-inspector");
}
