import type { Context } from "../../kernel";
import type { RenderPass } from "../render/api";
import type { Resource } from "../resources/api";
import { mediaKind } from "../../shared/media-kinds";
import { protocol as links } from "../links/protocol";
import { mediaRecovery } from "./webm";
import { inspectImage } from "./image-dialog";
import { embeddedNote } from "./note";

/** Resolve placeholders with pass-owned cancellation and native source identity. */
export function enhanceEmbeds(ctx: Context, pass: RenderPass): () => void {
  const events = new AbortController();
  const disposers: (() => void)[] = [];
  let active = true;
  const restore: (() => void)[] = [];
  const open = (target: string) => {
    void ctx.rpc
      .call(links, "open", {
        href: target,
        wiki: true,
        side: false,
        source: pass.documentUri,
      })
      .catch((error) => ctx.logger.warn("Open embed failed", error));
  };
  const button = (target: string, label: string) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.setAttribute("aria-label", `Open ${target}`);
    node.addEventListener("click", () => open(target), {
      signal: events.signal,
    });
    return node;
  };
  const apply = async (
    node: HTMLElement,
    target: string,
    resource: Resource,
  ) => {
    if (!active) {
      return;
    }
    if (resource.kind === "image") {
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
      image.addEventListener("load", pass.measure, { signal: events.signal });
      image.addEventListener(
        "error",
        () => {
          image.alt = `Could not load ${target}`;
          pass.measure();
        },
        { signal: events.signal },
      );
      if (image !== node) {
        node.replaceChildren(image);
      }
      const inspect = document.createElement("button");
      inspect.type = "button";
      inspect.textContent = "⤢";
      inspect.setAttribute("aria-label", `Inspect image: ${image.alt}`);
      image.after(inspect);
      disposers.push(
        () => inspect.remove(),
        inspectImage(inspect, resource.url, image.alt, () => open(target)),
      );
    } else if (resource.kind === "audio" || resource.kind === "video") {
      const media = document.createElement(resource.kind);
      media.src = resource.url;
      media.controls = true;
      media.preload = "metadata";
      media.setAttribute("aria-label", target);
      disposers.push(
        mediaRecovery(media, resource.url, (message) => {
          if (active) {
            node.textContent = `${target}: ${message}`;
            pass.measure();
          }
        }),
      );
      disposers.push(() => {
        media.pause();
        media.removeAttribute("src");
        media.load();
      });
      media.addEventListener("loadedmetadata", pass.measure, {
        signal: events.signal,
      });
      node.replaceChildren(media);
    } else if (resource.kind === "note" && resource.text !== undefined) {
      const selection = embeddedNote(
        resource.text,
        resource.source,
        target,
        pass.ancestry,
      );
      const section = document.createElement("section");
      section.className = "note-embed";
      const content = document.createElement("div");
      section.append(button(target, "Open note ↗"), content);
      node.replaceChildren(section);
      const nested = await ctx.render.into(content, selection.text, {
        documentUri: resource.source,
        documentText: resource.text,
        ancestry: selection.ancestry,
        sourceLine: selection.sourceLine,
        taskLineCount: selection.text.split("\n").length,
        measure: pass.measure,
      });
      if (active) {
        disposers.push(() => {
          void nested.dispose();
        });
      } else {
        await nested.dispose();
      }
    } else {
      node.replaceChildren(button(target, target));
    }
    if (active) {
      pass.measure();
    }
  };
  for (const node of pass.container.querySelectorAll<HTMLElement>(
    "[data-resource]",
  )) {
    const target = node.dataset.resource ?? "";
    const original = node.innerHTML;
    const src = node.getAttribute("src");
    restore.push(() => {
      node.innerHTML = original;
      if (src === null) {
        node.removeAttribute("src");
      } else {
        node.setAttribute("src", src);
      }
    });
    let resolve: Promise<Resource>;
    if (/^https?:/i.test(target)) {
      if (!ctx.render.trusted) {
        node.title = "Remote content is disabled in an untrusted workspace";
        continue;
      }
      resolve = Promise.resolve({
        kind: mediaKind(target) ?? "image",
        source: target,
        url: target,
      });
    } else if (/^data:image\//i.test(target)) {
      resolve = Promise.resolve({ kind: "image", source: target, url: target });
    } else {
      resolve = ctx.resources.load(target, pass.documentUri);
    }
    void resolve
      .then((resource) => apply(node, target, resource))
      .catch((error) => {
        if (active) {
          node.classList.add("unresolved-embed");
          node.title = String(error);
          pass.measure();
        }
      });
  }
  return () => {
    active = false;
    events.abort();
    for (const dispose of disposers.reverse()) {
      dispose();
    }
    for (const reset of restore) {
      reset();
    }
  };
}
