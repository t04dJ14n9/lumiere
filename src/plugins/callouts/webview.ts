import { StateEffect } from "@codemirror/state";
import { DisclosureState } from "./view-state";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../render/api";
import type {} from "../livePreview/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { insertCallout, isCallout } from "./edit";
const disclosureChanged = StateEffect.define<null>();
export const calloutsWebview: Plugin = {
  name: "callouts",
  inject: { required: ["editor", "commands", "render", "livePreview"] },
  apply(ctx) {
    const folds = new DisclosureState(ctx.editor.source);
    ctx.effect(() => ctx.editor.viewState.contribute("folds", folds));
    const cleanups = new Set<() => void>();
    ctx.effect(() => () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    });
    registerCalloutRenderer(ctx);
    registerDisclosures(ctx, folds, cleanups);
    registerInsertion(ctx);
  },
};

function registerCalloutRenderer(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "callout",
      editing: "reveal",
      match: (node, state) =>
        node.name === "Blockquote" &&
        isCallout(state.sliceDoc(node.from, node.to)),
      widget: (block) => new MarkdownBlock(block, ctx.render),
    }),
  );
}

function registerDisclosures(
  ctx: Context,
  folds: DisclosureState,
  cleanups: Set<() => void>,
): void {
  ctx.on("render/postProcess", (pass) => {
    const events = new AbortController();
    const bindings: { dispose(): void }[] = [];
    const cleanup = () => {
      events.abort();
      for (const binding of bindings) {
        binding.dispose();
      }
      cleanups.delete(cleanup);
    };
    cleanups.add(cleanup);
    pass.onDispose(cleanup);
    pass.container
      .querySelectorAll<HTMLDetailsElement>("details.callout")
      .forEach((details, index) => {
        const key = `${pass.ancestry.join("/")}|${pass.renderKey}|${index}`;
        const binding = folds.bind(key, details, pass.measure);
        bindings.push(binding);
        bindDisclosure({
          details,
          signal: events.signal,
          remember: () => {
            binding.remember();
            ctx.editor.view.dispatch({ effects: disclosureChanged.of(null) });
            pass.measure();
          },
        });
      });
  });
}

function registerInsertion(ctx: Context): void {
  ctx.effect(() =>
    ctx.commands.register("editor:insert-callout", () => {
      ctx.editor.view.dispatch(insertCallout(ctx.editor.view.state));
      return true;
    }),
  );
}

interface DisclosureEvents {
  details: HTMLDetailsElement;
  signal: AbortSignal;
  remember(): void;
}

function bindDisclosure({ details, signal, remember }: DisclosureEvents): void {
  details.querySelector(":scope > summary")?.addEventListener(
    "click",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a, button, input")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      details.open = !details.open;
      remember();
    },
    { signal: signal },
  );
  details.addEventListener("toggle", remember, {
    signal: signal,
  });
}
