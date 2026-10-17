import { tagSuggestion } from "./suggestions";
import { ViewPlugin } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import { validTag } from "../../markdown/tags/grammar";
import { TagWidget } from "./widget";
import { protocol } from "./protocol";
export const tagsWebview: Plugin = {
  name: "tags",
  inject: { required: ["editor", "livePreview", "rpc"] },
  // The settings only shape the window's Tags view; widgets stay as they are.
  reconfigure() {
    return true;
  },
  apply(ctx) {
    ctx.on("suggest/trigger", tagSuggestion);
    const search = (tag: string) => {
      void ctx.rpc
        .call(protocol, "search", { tag })
        .catch((error) => ctx.logger.warn("Tag search failed", error));
    };
    registerTagRenderer(ctx, search);
    registerTagControls(ctx, search);
    registerDelegatedTags(ctx, search);
  },
};
function registerTagRenderer(
  ctx: Context,
  search: (tag: string) => void,
): void {
  ctx.effect(() =>
    ctx.livePreview.inline({
      nodes: ["Tag"],
      decorate(node, cx) {
        if (!cx.revealed(node.from, node.to)) {
          cx.replace(
            node.from,
            node.to,
            new TagWidget(cx.state.sliceDoc(node.from + 1, node.to), search),
          );
        }
      },
    }),
  );
}
function registerTagControls(
  ctx: Context,
  search: (tag: string) => void,
): void {
  const cleanups = new Set<() => void>();
  ctx.effect(() => () => {
    for (const stop of cleanups) {
      stop();
    }
    cleanups.clear();
  });
  ctx.on("render/postProcess", (pass) => {
    const events = new AbortController();
    const controls = [
      ...pass.container.querySelectorAll<HTMLButtonElement>("button[data-tag]"),
    ];
    const stop = () => {
      events.abort();
      for (const button of controls) {
        button.disabled = true;
      }
      cleanups.delete(stop);
    };
    cleanups.add(stop);
    pass.onDispose(stop);
    for (const button of controls) {
      const tag = button.dataset.tag;
      if (!validTag(tag)) {
        button.disabled = true;
        continue;
      }
      button.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          search(tag);
        },
        { signal: events.signal },
      );
    }
  });
}

/** Reconciled widget content (such as Properties) can emit the same tag placeholders. */
function registerDelegatedTags(
  ctx: Context,
  search: (tag: string) => void,
): void {
  ctx.effect(() =>
    ctx.editor.extend(
      ViewPlugin.define((view) => {
        const events = new AbortController();
        view.dom.addEventListener(
          "click",
          (event) => {
            const button =
              event.target instanceof Element
                ? event.target.closest<HTMLButtonElement>("button[data-tag]")
                : null;
            if (!button || button.disabled || !validTag(button.dataset.tag)) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            search(button.dataset.tag);
          },
          { signal: events.signal },
        );
        return { destroy: () => events.abort() };
      }),
    ),
  );
}
