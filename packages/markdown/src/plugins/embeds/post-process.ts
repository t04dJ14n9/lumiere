import type { RenderPass, RenderService } from "../render/api";
import type { Resource, Resources } from "../resources/api";
import { mediaKind } from "../../shared/media-kinds";
import { mediaRecovery } from "./webm";
import { inspectImage } from "./image-dialog";
import { mountImageEmbedActions } from "./embed-actions";
import { embeddedNote, MissingSection } from "./note";
import { renderBaseEmbed } from "./base-embed";
import { mountPdfEmbed } from "./pdf-embed";

interface EmbedOptions {
  pass: RenderPass;
  render: RenderService;
  resources: Resources;
  open(target: string, wiki: boolean): void;
}

/** True when the resource element came from a wikilink embed (`![[...]]`). */
export function embedIsWiki(node: { dataset: { wiki?: string } }): boolean {
  return node.dataset.wiki === "true";
}

/** Resolve placeholders with pass-owned cancellation and native source identity. */
export function enhanceEmbeds(options: EmbedOptions): (() => void) | undefined {
  const nodes =
    options.pass.container.querySelectorAll<HTMLElement>("[data-resource]");
  if (nodes.length === 0) {
    return undefined;
  }
  const embeds = new EmbedPass(options);
  embeds.start(nodes);
  return () => embeds.dispose();
}

class EmbedPass {
  private readonly events = new AbortController();
  private readonly disposers: (() => void)[] = [];
  private readonly restore: (() => void)[] = [];
  private isActive = true;
  constructor(private readonly options: EmbedOptions) {}

  start(nodes: Iterable<HTMLElement>): void {
    const { pass } = this.options;
    for (const node of nodes) {
      const target = node.dataset.resource ?? "";
      this.rememberPlaceholder(node);
      const handleError = (error: unknown) => {
        if (this.isActive) {
          node.classList.add("unresolved-embed");
          node.textContent = missingEmbedText(target, {
            note: noteName(pass.documentUri),
            section: error instanceof MissingSection,
          });
          node.title = String(error);
          pass.measure();
        }
      };
      const resource = this.resolve(node, target);
      if (!resource) {
        continue;
      }
      if (isPromise(resource)) {
        void resource
          .then((resolved) => this.apply(node, target, resolved))
          .catch(handleError);
      } else {
        void this.apply(node, target, resource).catch(handleError);
      }
    }
  }

  dispose(): void {
    this.isActive = false;
    this.events.abort();
    for (const dispose of this.disposers.reverse()) {
      dispose();
    }
    for (const reset of this.restore) {
      reset();
    }
  }

  private rememberPlaceholder(node: HTMLElement): void {
    const original = node.innerHTML;
    const src = node.getAttribute("src");
    this.restore.push(() => {
      node.innerHTML = original;
      if (src === null) {
        node.removeAttribute("src");
      } else {
        node.setAttribute("src", src);
      }
    });
  }

  private resolve(
    node: HTMLElement,
    target: string,
  ): Resource | Promise<Resource> | undefined {
    const { render, resources, pass } = this.options;
    if (/^https?:/i.test(target)) {
      if (!render.trusted) {
        node.title = "Remote content is disabled in an untrusted workspace";
        return undefined;
      }
      return {
        kind: mediaKind(target) ?? "image",
        source: target,
        url: target,
      };
    }
    if (/^data:image\//i.test(target)) {
      return { kind: "image", source: target, url: target };
    }
    const syntax = node.dataset.wiki === "true" ? "wikilink" : "markdown";
    const key = `${syntax}\0${pass.documentUri ?? ""}\0${target}`;
    const cached =
      resources.peek?.(target, pass.documentUri, syntax) ??
      getCachedEmbedResource(resources, key);
    if (cached !== undefined) {
      return cached;
    }
    return resources.load(target, pass.documentUri, syntax).then((resolved) => {
      if (resolved.kind !== "note" && resolved.kind !== "base") {
        setCachedEmbedResource(resources, key, resolved);
      }
      return resolved;
    });
  }

  private openButton(
    target: string,
    wiki: boolean,
    label: string,
    className: "open-embed" | "attachment-open",
  ): HTMLButtonElement {
    const node = document.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = label;
    node.setAttribute("aria-label", `Open ${target}`);
    node.addEventListener("click", () => this.options.open(target, wiki), {
      signal: this.events.signal,
    });
    return node;
  }

  private async apply(
    node: HTMLElement,
    target: string,
    resource: Resource,
  ): Promise<void> {
    if (!this.isActive) {
      return;
    }
    const wiki = embedIsWiki(node);
    if (resource.kind === "image") {
      this.showImage(node, target, resource, wiki);
    } else if (resource.kind === "audio" || resource.kind === "video") {
      this.showMedia(node, target, resource);
    } else if (resource.kind === "note" && resource.text !== undefined) {
      await this.showNote(node, target, resource, wiki);
    } else if (resource.kind === "base") {
      renderBaseEmbed(node, {
        target,
        wiki,
        resource,
        open: (href, isWiki) => this.options.open(href, isWiki),
      });
    } else if (resource.kind === "pdf") {
      mountPdfEmbed({
        node,
        target,
        url: resource.url,
        wiki,
        signal: this.events.signal,
        measure: this.options.pass.measure,
        open: (openTarget, isWiki) => this.options.open(openTarget, isWiki),
      });
    } else {
      node.replaceChildren(
        this.openButton(target, wiki, target, "attachment-open"),
      );
    }
    if (this.isActive) {
      this.options.pass.measure();
    }
  }

  private showImage(
    node: HTMLElement,
    target: string,
    resource: Resource,
    wiki: boolean,
  ): void {
    const { pass } = this.options;
    const image =
      node instanceof HTMLImageElement ? node : document.createElement("img");
    image.src = resource.url;
    image.alt ||= target;
    image.removeAttribute?.("loading");
    image.decoding = "async";
    if (node.dataset.width) {
      image.width = Number(node.dataset.width);
    }
    if (node.dataset.height) {
      image.height = Number(node.dataset.height);
    }
    image.addEventListener("load", pass.measure, {
      signal: this.events.signal,
    });
    image.addEventListener(
      "error",
      () => {
        image.alt = `Could not load ${target}`;
        pass.measure();
      },
      { signal: this.events.signal },
    );
    if (image !== node) {
      node.replaceChildren(image);
    }
    this.mountImageInspect(node, image, target, wiki);
  }

  private mountImageInspect(
    node: HTMLElement,
    image: HTMLImageElement,
    target: string,
    wiki: boolean,
  ): void {
    // Markdown <img data-resource> has no embed span; wrap so .image-embed
    // chrome never tags the line/paragraph (that split selection into bands).
    const host = image !== node ? node : document.createElement("span");
    if (host !== node) {
      image.replaceWith(host);
      host.append(image);
    }
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.className = "inspect-image";
    inspect.textContent = "⤢";
    inspect.setAttribute("aria-label", `Inspect image: ${image.alt}`);
    const actions = mountImageEmbedActions(image, host, inspect);
    image.addEventListener(
      "dblclick",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        inspect.click();
      },
      { signal: this.events.signal },
    );
    this.disposers.push(
      () => {
        actions.remove();
        if (host !== node && host.parentNode) {
          host.replaceWith(image);
        }
      },
      inspectImage(inspect, image.src, image.alt, () =>
        this.options.open(target, wiki),
      ),
    );
  }

  private showMedia(
    node: HTMLElement,
    target: string,
    resource: Resource,
  ): void {
    const { pass } = this.options;
    const media = document.createElement(resource.kind as "audio" | "video");
    media.src = resource.url;
    media.controls = true;
    media.preload = "metadata";
    media.setAttribute("aria-label", target);
    this.disposers.push(
      mediaRecovery(media, resource.url, (message) => {
        if (this.isActive) {
          node.textContent = `${target}: ${message}`;
          pass.measure();
        }
      }),
    );
    this.disposers.push(() => {
      media.pause();
      media.removeAttribute("src");
      media.load();
    });
    media.addEventListener("loadedmetadata", pass.measure, {
      signal: this.events.signal,
    });
    node.replaceChildren(media);
  }

  private async showNote(
    node: HTMLElement,
    target: string,
    resource: Resource,
    wiki: boolean,
  ): Promise<void> {
    const { pass, render } = this.options;
    // apply admits note resources only after checking their text.
    const text = resource.text!;
    const selection = embeddedNote(
      text,
      resource.source,
      target,
      pass.ancestry,
    );
    const section = document.createElement("section");
    section.className = "note-embed";
    const content = document.createElement("div");
    section.append(this.openButton(target, wiki, "↗", "open-embed"), content);
    node.replaceChildren(section);
    const nested = await render.into(content, selection.text, {
      ...(pass.readOnly === undefined ? {} : { readOnly: pass.readOnly }),
      documentUri: resource.source,
      documentText: text,
      ancestry: selection.ancestry,
      sourceLine: selection.sourceLine,
      taskLineCount: selection.text.split("\n").length,
      measure: pass.measure,
    });
    if (this.isActive) {
      this.disposers.push(() => {
        void nested.dispose();
      });
    } else {
      await nested.dispose();
    }
  }
}

/**
 * What an embed that can't be resolved says, as in Obsidian: a missing file
 * by its path, a missing heading or block in a note by the note's name (the
 * current note's for `![[#Heading]]`).
 */
export function missingEmbedText(
  target: string,
  missing: { note?: string | undefined; section?: boolean } = {},
): string {
  const path = target.split("|")[0]!.trim();
  const hash = path.indexOf("#");
  if (missing.section && hash >= 0) {
    const note = path.slice(0, hash).split("/").at(-1) || missing.note;
    return `Unable to find “${path.slice(hash + 1)}” in ${note ?? "this note"}`;
  }
  return `"${path}" could not be found.`;
}

/** A note's name from its URI, without `.md`. */
function noteName(uri: string | undefined): string | undefined {
  const name = uri?.split("/").at(-1);
  return name && decodeURIComponent(name).replace(/\.md$/iu, "");
}

const EMBED_CACHE_LIMIT = 256;
const embedResourceCaches = new WeakMap<
  EmbedOptions["resources"],
  Map<string, Resource>
>();

function isPromise(
  value: Resource | Promise<Resource>,
): value is Promise<Resource> {
  return typeof (value as { then?: unknown }).then === "function";
}

function getCachedEmbedResource(
  resources: EmbedOptions["resources"],
  key: string,
): Resource | undefined {
  const map = embedResourceCaches.get(resources);
  if (!map) {
    return undefined;
  }
  const cached = map.get(key);
  if (cached !== undefined) {
    map.delete(key);
    map.set(key, cached);
  }
  return cached;
}

function setCachedEmbedResource(
  resources: EmbedOptions["resources"],
  key: string,
  resource: Resource,
): void {
  let map = embedResourceCaches.get(resources);
  if (!map) {
    map = new Map<string, Resource>();
    embedResourceCaches.set(resources, map);
  }
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= EMBED_CACHE_LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) {
      map.delete(oldest);
    }
  }
  map.set(key, resource);
}
