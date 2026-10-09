import { noteFragment } from "../../markdown/metadata/fragments";
import { attr, escape } from "../../markdown/html/helpers";
import type { RenderPass, RenderService } from "../render/api";
import type { Resource } from "../resources/api";

export function notePreview(text: string, href: string, source: string) {
  const fragment = href.split("#").slice(1).join("#");
  const selection = noteFragment(text, fragment);
  if (!selection) {
    throw new Error("Section not found.");
  }
  return {
    text: selection.text,
    context: {
      documentUri: source,
      documentText: text,
      sourceLine: text.slice(0, selection.from).split("\n").length - 1,
      taskLineCount: 0,
      ancestry: [source + "#" + fragment],
    },
  };
}

/** Previews share the render pipeline but never authorize task edits. */
export async function renderPreview(options: {
  body: HTMLElement;
  resource: Resource;
  href: string;
  source?: string;
  render: RenderService;
}): Promise<RenderPass | undefined> {
  const { body, resource, href, source, render } = options;
  if (resource.kind === "note" && resource.text !== undefined) {
    const preview = notePreview(resource.text, href, resource.source);
    return render.into(body, preview.text, preview.context);
  }
  if (["image", "pdf", "audio", "video"].includes(resource.kind)) {
    return render.into(
      body,
      `<span${attr("data-resource", href)}>${escape(href)}</span>`,
      {
        ...(source === undefined ? {} : { documentUri: source }),
        taskLineCount: 0,
      },
    );
  }
  body.textContent = `${resource.kind.toUpperCase()} attachment — use Open to view it.`;
  return undefined;
}
