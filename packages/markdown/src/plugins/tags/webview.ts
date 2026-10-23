import { tagSuggestion } from "./suggestions";
import { ViewPlugin } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import { validTag } from "../../markdown/tags/grammar";
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
    registerTagRenderer(ctx);
    registerTagClicks(ctx, search);
    registerTagControls(ctx, search);
    registerDelegatedTags(ctx, search);
  },
};
/**
 * A tag stays text, styled as a tag, as in Obsidian: never hidden, and the
 * caret goes where it is clicked.
 */
function registerTagRenderer(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.inline({
      nodes: ["Tag"],
      decorate(node, cx) {
        cx.mark(node.from, node.to, "md-tag", {
          "data-tag": cx.state.sliceDoc(node.from + 1, node.to),
        });
      },
    }),
  );
}

/** Pixels of pointer travel that count as a drag, not a click (BH-050). */
const TAG_DRAG_PX = 4;

/**
 * Whether a click on a tag searches for it: a primary click that left the
 * caret in it, not a Shift-click or a drag, which only select.
 */
export function clickSearches(
  click: Pick<MouseEvent, "button" | "shiftKey">,
  caretOnly: boolean,
  tag: string | undefined,
): tag is string {
  return click.button === 0 && !click.shiftKey && caretOnly && validTag(tag);
}

/**
 * Tag under a pointer event's target, if any (LP mark or rendered button).
 */
export function tagFromEventTarget(
  target: EventTarget | null,
): string | undefined {
  if (
    target == null ||
    typeof Element === "undefined" ||
    !(target instanceof Element)
  ) {
    return undefined;
  }
  const tag = target.closest<HTMLElement>(".md-tag[data-tag]")?.dataset.tag;
  return validTag(tag) ? tag : undefined;
}

/**
 * Clicking a tag in the note puts the caret there and searches for the tag,
 * as in Obsidian.
 *
 * BH-050: read the tag on mousedown. CodeMirror places the caret before
 * `click`, which can split the mark decoration so the click target no longer
 * carries `data-tag` / `.md-tag`. Listening on `view.dom` (not a stale outer
 * `contentDOM`) matches property tag buttons.
 */
function registerTagClicks(ctx: Context, search: (tag: string) => void): void {
  ctx.effect(() =>
    ctx.editor.extend(
      ViewPlugin.define((view) => {
        const events = new AbortController();
        let pending: { tag: string; x: number; y: number } | undefined;
        view.dom.addEventListener(
          "mousedown",
          (event) => {
            if (event.button !== 0) {
              pending = undefined;
              return;
            }
            const tag = tagFromEventTarget(event.target);
            pending = tag
              ? { tag, x: event.clientX, y: event.clientY }
              : undefined;
          },
          { signal: events.signal },
        );
        view.dom.addEventListener(
          "click",
          (event) => {
            const start = pending;
            pending = undefined;
            if (
              !start ||
              !clickSearches(
                event,
                // Drag distance, not post-click selection: caret placement can
                // briefly look non-empty while CM settles the click.
                Math.hypot(event.clientX - start.x, event.clientY - start.y) <=
                  TAG_DRAG_PX,
                start.tag,
              )
            ) {
              return;
            }
            search(start.tag);
          },
          { signal: events.signal },
        );
        return { destroy: () => events.abort() };
      }),
    ),
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
