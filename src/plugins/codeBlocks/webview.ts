import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../render/api";
import type {} from "../livePreview/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { codeSource } from "./code-source";
import { codePosition } from "./code-selection";
export const codeBlocksWebview: Plugin = {
  name: "codeBlocks",
  inject: { required: ["editor", "livePreview", "render"] },
  apply(ctx) {
    const cleanups = new Set<() => void>();
    let live = true;
    ctx.effect(() => () => {
      live = false;
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    });
    ctx.effect(() => ctx.editor.extend(codeSource));
    for (const kind of ["CodeBlock", "FencedCode"]) {
      ctx.effect(() =>
        ctx.livePreview.block({
          kind,
          editing: "reveal",
          match: (node) => node.name === kind,
          widget: (block) => new MarkdownBlock(block, ctx.render),
        }),
      );
    }
    ctx.on("render/postProcess", (pass) => {
      let active = true;
      const events = new AbortController();
      const copies: HTMLElement[] = [];
      const originals = new Map<HTMLElement, string>();
      const cleanup = () => {
        active = false;
        events.abort();
        for (const copy of copies) copy.remove();
        for (const [code, text] of originals) code.textContent = text;
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      pass.onDispose(cleanup);
      for (const code of pass.container.querySelectorAll<HTMLElement>(
        "pre code",
      )) {
        const pre = code.parentElement!;
        const copy = document.createElement("button");
        copy.textContent = "Copy";
        copy.setAttribute("aria-label", "Copy code");
        pre.before(copy);
        copies.push(copy);
        originals.set(code, code.textContent ?? "");
        pass.onDispose(() => copy.remove());
        copy.addEventListener(
          "click",
          () => {
            void ctx.editor.clipboard
              .write(code.textContent ?? "")
              .catch((error) => ctx.logger.error("Copy failed", error));
          },
          { signal: events.signal },
        );
        code.addEventListener(
          "click",
          (event) => {
            const view = ctx.editor.view;
            if (!view.dom.contains(code)) return;
            const offset = codePosition(
              pass.source,
              code,
              event,
              /^\s*(```|~~~)/.test(pass.source),
            );
            if (offset === undefined) return;
            const shell = code.closest<HTMLElement>(".hybrid-block");
            if (!shell) return;
            const from = view.posAtDOM(shell) + offset;
            if (from > view.state.doc.length) return;
            view.dispatch({
              selection: { anchor: from },
              scrollIntoView: true,
            });
            view.focus();
          },
          { signal: events.signal },
        );
        void import("./code-highlight")
          .then(({ highlight }) => {
            if (live && active) {
              highlight(code);
              pass.measure();
            }
          })
          .catch((error) => ctx.logger.warn("Code highlighting failed", error));
      }
    });
  },
};
