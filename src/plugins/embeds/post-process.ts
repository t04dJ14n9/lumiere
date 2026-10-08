import type { RenderPass, RenderService } from "../render/api";
import type { Resource, Resources } from "../resources/api";
import { mediaKind } from "../../shared/media-kinds";
import { mediaRecovery } from "./webm";
import { inspectImage } from "./image-dialog";
import { embeddedNote } from "./note";

interface EmbedOptions {
  pass: RenderPass;
  render: RenderService;
  resources: Resources;
  open(target: string): void;
}

/** Resolve placeholders with pass-owned cancellation and native source identity. */
export function enhanceEmbeds(options: EmbedOptions): () => void {
  const embeds = new EmbedPass(options);
  embeds.start();
  return () => embeds.dispose();
}

class EmbedPass {
  private readonly events = new AbortController();
  private readonly disposers: (() => void)[] = [];
  private readonly restore: (() => void)[] = [];
  private isActive = true;
  constructor(private readonly options: EmbedOptions) {}

  start(): void {
    const { pass } = this.options;
    for (const node of pass.container.querySelectorAll<HTMLElement>(
      "[data-resource]",
    )) {
      const target = node.dataset.resource ?? "";
      this.rememberPlaceholder(node);
      const resource = this.resolve(node, target);
      if (!resource) {
        continue;
      }
      void resource
        .then((resource) => this.apply(node, target, resource))
        .catch((error) => {
          if (this.isActive) {
            node.classList.add("unresolved-embed");
            node.title = String(error);
            pass.measure();
          }
        });
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
  ): Promise<Resource> | undefined {
    const { render, resources, pass } = this.options;
    if (/^https?:/i.test(target)) {
      if (!render.trusted) {
        node.title = "Remote content is disabled in an untrusted workspace";
        return undefined;
      }
      return Promise.resolve({
        kind: mediaKind(target) ?? "image",
        source: target,
        url: target,
      });
    }
    if (/^data:image\//i.test(target)) {
      return Promise.resolve({ kind: "image", source: target, url: target });
    }
    return resources.load(target, pass.documentUri);
  }

  private openButton(target: string, label: string): HTMLButtonElement {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.setAttribute("aria-label", `Open ${target}`);
    node.addEventListener("click", () => this.options.open(target), {
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
    if (resource.kind === "image") {
      this.showImage(node, target, resource);
    } else if (resource.kind === "audio" || resource.kind === "video") {
      this.showMedia(node, target, resource);
    } else if (resource.kind === "note" && resource.text !== undefined) {
      await this.showNote(node, target, resource);
    } else {
      node.replaceChildren(this.openButton(target, target));
    }
    if (this.isActive) {
      this.options.pass.measure();
    }
  }

  private showImage(
    node: HTMLElement,
    target: string,
    resource: Resource,
  ): void {
    const { pass } = this.options;
    const image =
      node instanceof HTMLImageElement ? node : document.createElement("img");
    image.src = resource.url;
    image.alt ||= target;
    image.loading = "lazy";
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
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.textContent = "⤢";
    inspect.setAttribute("aria-label", `Inspect image: ${image.alt}`);
    image.after(inspect);
    this.disposers.push(
      () => inspect.remove(),
      inspectImage(inspect, resource.url, image.alt, () =>
        this.options.open(target),
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
  ): Promise<void> {
    const { pass, render } = this.options;
    // apply admits note resources only after checking their text.
    const selection = embeddedNote(
      resource.text!,
      resource.source,
      target,
      pass.ancestry,
    );
    const section = document.createElement("section");
    section.className = "note-embed";
    const content = document.createElement("div");
    section.append(this.openButton(target, "Open note ↗"), content);
    node.replaceChildren(section);
    const nested = await render.into(content, selection.text, {
      readOnly: pass.readOnly,
      documentUri: resource.source,
      documentText: resource.text,
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
