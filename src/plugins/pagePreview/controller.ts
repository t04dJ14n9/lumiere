import type { RenderPass, RenderService } from "../render/api";
import type { Resources } from "../resources/api";
import { noteFragment } from "../../markdown/metadata/fragments";
import { attr, escape } from "../../markdown/html/helpers";
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
  const abort = new AbortController(),
    options = { signal: abort.signal };
  let hovered: HTMLElement | null = null,
    shown: HTMLElement | null = null;
  let popup: HTMLElement | undefined,
    body: HTMLElement | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    generation = 0;
  let renderedPass: RenderPass | undefined;
  let reload: (() => void) | undefined;
  const close = (): void => {
    const focused = popup?.contains(document.activeElement);
    clearTimeout(timer);
    generation++;
    shown = null;
    reload = undefined;
    if (body) {
      void renderedPass?.dispose();
      renderedPass = undefined;
    }
    popup?.remove();
    popup = body = undefined;
    if (focused && document.hasFocus()) {
      restoreFocus?.();
    }
  };
  const show = async (link: HTMLElement, keyboard = false): Promise<void> => {
    const href = link.dataset.href ?? link.getAttribute("href");
    if (!href || !canPreview(href)) {
      return;
    }
    if (shown === link) {
      if (keyboard) {
        popup?.querySelector<HTMLButtonElement>("button")?.focus();
      }
      return;
    }
    close();
    shown = link;
    const base = context(),
      source =
        link.closest<HTMLElement>("[data-note-source]")?.dataset.noteSource;
    popup = document.createElement("aside");
    popup.className = "link-preview";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Link preview");
    let label = href;
    try {
      label = decodeURI(href);
    } catch {
      /* Preserve invalid escapes for the resolver error. */
    }
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = `Open ${label}`;
    open.onclick = () => {
      base.open(
        href,
        source,
        link.dataset.wiki === "true" ||
          link.classList.contains("internal-link"),
      );
      close();
    };
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Close";
    dismiss.setAttribute("aria-label", "Close link preview");
    dismiss.onclick = close;
    body = document.createElement("div");
    body.textContent = "Loading…";
    popup.append(open, dismiss, body);
    root.append(popup);
    if (keyboard) {
      open.focus();
    }
    const bounds = link.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(bounds.bottom + 6, innerHeight - 350))}px`;
    const load = async (): Promise<void> => {
      const request = ++generation;
      if (body) {
        void renderedPass?.dispose();
        renderedPass = undefined;
        body.textContent = "Loading…";
      }
      try {
        const resource = await base.resources.load(href, source);
        if (!body || request !== generation) {
          return;
        }
        if (!resource) {
          throw new Error("Preview unavailable.");
        }
        let next: RenderPass | undefined;
        if (resource.kind === "note" && resource.text !== undefined) {
          const fragment = href.split("#").slice(1).join("#");
          const selection = noteFragment(resource.text, fragment);
          if (!selection) throw new Error("Section not found.");
          next = await base.render.into(body, selection.text, {
            documentUri: resource.source,
            documentText: resource.text,
            sourceLine:
              resource.text.slice(0, selection.from).split("\n").length - 1,
            taskLineCount: 0,
            ancestry: [resource.source + "#" + fragment],
          });
        } else if (["image", "pdf", "audio", "video"].includes(resource.kind)) {
          next = await base.render.into(
            body,
            `<span${attr("data-resource", href)}>${escape(href)}</span>`,
            { documentUri: source, taskLineCount: 0 },
          );
        } else {
          body.textContent = `${resource.kind.toUpperCase()} attachment — use Open to view it.`;
        }
        if (request !== generation) await next?.dispose();
        else renderedPass = next;
      } catch (error) {
        if (body && request === generation) {
          body.textContent = String(error);
        }
      }
    };
    reload = () => {
      void load();
    };
    await load();
  };
  root.addEventListener(
    "mousemove",
    (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("a[href], [data-href]")
          : null;
      if (target !== hovered) {
        clearTimeout(timer);
        hovered = target;
      }
      if (target && (event.metaKey || event.ctrlKey) && shown !== target) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void show(target);
        }, 300);
      }
    },
    options,
  );
  document.addEventListener(
    "mouseover",
    (event) => {
      if (document.querySelector(".image-inspector[open]")) {
        clearTimeout(timer);
        return;
      }
      const target = event.target as Node;
      if (popup?.contains(target) || hovered?.contains(target)) {
        clearTimeout(timer);
        return;
      }
      clearTimeout(timer);
      hovered = null;
      if (popup) {
        clearTimeout(timer);
        timer = setTimeout(close, 200);
      }
    },
    options,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".image-inspector")
      ) {
        return;
      }
      if (event.key === "Escape" && popup) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      if (
        event.altKey &&
        event.key === "Enter" &&
        !(
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        )
      ) {
        const node = window.getSelection()?.anchorNode;
        const target = (
          node instanceof Element ? node : node?.parentElement
        )?.closest<HTMLElement>("a[href], [data-href]");
        if (target && root.contains(target)) {
          event.preventDefault();
          event.stopPropagation();
          void show(target, true);
        }
      }
      if ((event.key === "Control" || event.key === "Meta") && hovered) {
        const link = hovered;
        clearTimeout(timer);
        timer = setTimeout(() => {
          void show(link);
        }, 300);
      }
    },
    { ...options, capture: true },
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if ((event.key === "Control" || event.key === "Meta") && !popup) {
        clearTimeout(timer);
      }
    },
    options,
  );
  window.addEventListener("blur", close, options);
  document.addEventListener(
    "focusin",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".image-inspector")
      ) {
        return;
      }
      if (popup && !popup.contains(event.target as Node)) {
        close();
      }
    },
    options,
  );
  return {
    dispose: () => {
      abort.abort();
      close();
    },
    refresh: () => reload?.(),
    close,
  };
}
