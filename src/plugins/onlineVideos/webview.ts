import type { Plugin } from "../../kernel";
import { protocol as links } from "../links/protocol";
import type { RenderPass } from "../render/api";
import type {} from "../render/api";
import { videoCard } from "./card";
import { parseVideoUrl } from "./parse";

export const onlineVideosWebview: Plugin = {
  name: "onlineVideos",
  inject: { required: ["render", "rpc"] },
  apply(ctx) {
    const open = (href: string) => {
      void ctx.rpc
        .call(links, "open", { href, wiki: false, side: false })
        .catch((error) => ctx.logger.warn("Open video failed", error));
    };
    // Runs before embeds, which would otherwise treat the link as an image.
    ctx.on("render/postProcess", (pass) =>
      mountVideos(pass, ctx.render.trusted === true, open),
    );
  },
};

export function mountVideos(
  pass: RenderPass,
  trusted: boolean,
  open: (href: string) => void,
): void {
  const events = new AbortController();
  const restore: (() => void)[] = [];
  for (const image of pass.container.querySelectorAll<HTMLImageElement>(
    "img.note-image[data-resource]",
  )) {
    const video = parseVideoUrl(image.dataset.resource ?? "");
    if (!video) {
      continue;
    }
    const card = videoCard(video, {
      label: image.alt,
      trusted,
      signal: events.signal,
      measure: pass.measure,
      open,
    });
    image.replaceWith(card);
    restore.push(() => card.replaceWith(image));
  }
  if (restore.length) {
    pass.onDispose(() => {
      events.abort();
      for (const undo of restore) {
        undo();
      }
    });
  }
}
