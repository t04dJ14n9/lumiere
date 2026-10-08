import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Plugin } from "../../kernel";
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
    const cleanups = new Set<() => void>();
    ctx.effect(() => () => { for (const cleanup of cleanups) cleanup(); cleanups.clear(); });
    ctx.effect(() => ctx.editor.extend(EditorView.baseTheme({
      ".callout": { borderLeft: "3px solid var(--vscode-textLink-foreground)", padding: "8px 12px", background: "var(--vscode-textBlockQuote-background)" },
      ".callout-title": { fontWeight: "600", cursor: "pointer" },
      ".callout-content > :last-child": { marginBottom: "0" },
    })));
    ctx.effect(() => ctx.livePreview.block({
      kind: "callout", editing: "reveal",
      match: (node, state) => node.name === "Blockquote" && isCallout(state.sliceDoc(node.from, node.to)),
      widget: (block) => new MarkdownBlock(block, ctx.render),
    }));
    ctx.on("render/postProcess", (pass) => {
      const events = new AbortController();
      const cleanup = () => { events.abort(); cleanups.delete(cleanup); };
      cleanups.add(cleanup);
      pass.onDispose(cleanup);
      pass.container.querySelectorAll<HTMLDetailsElement>("details.callout").forEach((details, index) => {
        const key = `${pass.ancestry.join("/")}|${pass.renderKey}|${index}`;
        const stored = ctx.editor.folds.get(key);
        if (stored !== undefined) details.open = stored;
        const remember = () => {
          ctx.editor.folds.set(key, details.open);
          ctx.editor.view.dispatch({ effects: disclosureChanged.of(null) });
          pass.measure();
        };
        details.querySelector(":scope > summary")?.addEventListener("click", (event) => {
          if (event.target instanceof Element && event.target.closest("a, button, input")) return;
          event.preventDefault();
          event.stopPropagation();
          details.open = !details.open;
          remember();
        }, { signal: events.signal });
        details.addEventListener("toggle", remember, { signal: events.signal });
      });
    });
    ctx.effect(() => ctx.commands.register("editor:insert-callout", () => {
      ctx.editor.view.dispatch(insertCallout(ctx.editor.view.state));
      return true;
    }));
  },
};
