import { StateEffect } from "@codemirror/state";
import { DisclosureState } from "./view-state";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../render/api";
import type {} from "../livePreview/api";
import { resolveCalloutIcon } from "../../webview/ui/icons";
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
      nodes: ["Blockquote"],
      editing: "reveal",
      match: (node, state) =>
        node.name === "Blockquote" &&
        isCallout(state.sliceDoc(node.from, node.to)),
      widget: (block) =>
        new MarkdownBlock(block, ctx.render, {
          reveal: "click",
          guardMargin: true,
        }),
    }),
  );
}

function parseColorTuple(raw: string): string | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    const digits = hex[1]!;
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((char) => char + char)
            .join("")
        : digits;
    const red = Number.parseInt(full.slice(0, 2), 16);
    const green = Number.parseInt(full.slice(2, 4), 16);
    const blue = Number.parseInt(full.slice(4, 6), 16);
    return `${red}, ${green}, ${blue}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(raw);
  if (rgb) {
    return `${rgb[1]}, ${rgb[2]}, ${rgb[3]}`;
  }
  return undefined;
}

export function applyCustomCalloutStyles(root: ParentNode): void {
  const callouts = root.querySelectorAll<HTMLElement>(".callout[data-callout]");
  for (const callout of callouts) {
    const style = getComputedStyle(callout);
    const rawColor = style.getPropertyValue("--callout-color").trim();
    const tuple = rawColor ? parseColorTuple(rawColor) : undefined;
    if (tuple) {
      callout.style.setProperty("--callout-color", tuple);
    }
    const rawIcon = style.getPropertyValue("--callout-icon").trim();
    if (!rawIcon) {
      continue;
    }
    const iconSvg = resolveCalloutIcon(rawIcon);
    const currentIcon = callout.querySelector(
      ":scope > .callout-title > .callout-icon",
    );
    if (iconSvg && currentIcon) {
      const template = document.createElement("template");
      template.innerHTML = iconSvg;
      const replacement = template.content.firstElementChild;
      if (replacement) {
        currentIcon.replaceWith(replacement);
      }
    }
  }
}

function registerDisclosures(
  ctx: Context,
  folds: DisclosureState,
  cleanups: Set<() => void>,
): void {
  ctx.on("render/postProcess", (pass) => {
    applyCustomCalloutStyles(pass.container);
    const disclosures =
      pass.container.querySelectorAll<HTMLDetailsElement>("details.callout");
    if (disclosures.length === 0) {
      return;
    }
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
    disclosures.forEach((details, index) => {
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

export function bindDisclosure({
  details,
  signal,
  remember,
}: DisclosureEvents): void {
  details.querySelector(":scope > summary")?.addEventListener(
    "click",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a, input, button:not(.callout-fold)")
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
