import { protocol as links } from "../links/protocol";
import { EditorView } from "@codemirror/view";
import { Text } from "@codemirror/state";
import type { Plugin } from "../../kernel";
import { footnotes } from "../../markdown/metadata/footnotes";
import type { Footnote } from "../../markdown/metadata/footnotes";
import { markdownParser } from "../../markdown/dialect";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type { RenderPass } from "../render/api";
import { FootnoteDefinition } from "./definition-widget";
import { FootnoteReference, mountReference } from "./reference-widget";
import { insertFootnote } from "./edit";
export const footnotesWebview: Plugin = {
  name: "footnotes",
  inject: { required: ["editor", "commands", "livePreview", "render", "rpc"] },
  apply(ctx) {
    const view = ctx.editor.view;
    let active = true;
    let key = "";
    ctx.effect(() => () => {
      active = false;
    });
    ctx.effect(() =>
      ctx.editor.extend(
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          const next = JSON.stringify(footnotes(update.state.doc).definitions);
          if (next === key) {
            return;
          }
          key = next;
          queueMicrotask(() => {
            if (active) {
              ctx.emit("render/changed");
            }
          });
        }),
      ),
    );
    const references = new WeakMap<
      RenderPass,
      { id: string; note: Footnote }[]
    >();
    const cleanups = new Set<() => void>();
    ctx.effect(() => () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    });
    ctx.effect(() =>
      ctx.editor.extend(
        EditorView.baseTheme({
          ".hybrid-footnote-ref": { position: "relative" },
          ".footnote-preview": {
            position: "absolute",
            left: "0",
            top: "100%",
            zIndex: "100",
            width: "min(320px, 70vw)",
            padding: "12px",
            background: "var(--vscode-editorHoverWidget-background)",
            border: "1px solid var(--vscode-editorHoverWidget-border)",
            fontSize: "14px",
          },
        }),
      ),
    );
    ctx.effect(() =>
      ctx.livePreview.inline({
        nodes: ["FootnoteRef", "InlineFootnote"],
        decorate(node, cx) {
          const note = footnotes(cx.state.doc).references.get(node.from);
          if (note && !cx.revealed(node.from, node.to)) {
            cx.replace(
              node.from,
              node.to,
              new FootnoteReference(note, ctx.render),
            );
          }
        },
      }),
    );
    ctx.effect(() =>
      ctx.livePreview.block({
        kind: "footnote",
        editing: "reveal",
        match: (node, state) =>
          node.name !== "Document" &&
          footnotes(state.doc).definitions.some(
            (note) => note.label && note.marker === node.from,
          ),
        range: (node, state) =>
          footnotes(state.doc).definitions.find(
            (note) => note.marker === node.from,
          ) ?? node,
        widget(block) {
          const note = footnotes(view.state.doc).definitions.find(
            (note) => note.from === block.from,
          );
          if (!note) {
            throw new Error("Footnote definition changed while rendering");
          }
          return new FootnoteDefinition(block, note, ctx.render);
        },
      }),
    );
    ctx.on("render/preProcess", (pass) => {
      if (pass.ancestry.includes("footnote-preview")) {
        return;
      }
      const document =
        pass.documentText === undefined
          ? view.state.doc
          : Text.of(pass.documentText.split("\n"));
      const registry = footnotes(document);
      const local = footnotes(Text.of(pass.source.split("\n")));
      const base = document.line(
        Math.min(document.lines, pass.sourceLine + 1),
      ).from;
      const nonce = crypto.getRandomValues(new Uint32Array(4)).join("-");
      const replacements: {
        from: number;
        to: number;
        id: string;
        note: Footnote;
      }[] = [];
      markdownParser.parse(pass.source).iterate({
        enter(node) {
          if (node.name !== "FootnoteRef" && node.name !== "InlineFootnote") {
            return;
          }
          const label = pass.source.slice(node.from + 2, node.to - 1);
          const note =
            node.name === "FootnoteRef"
              ? registry.definitions.find((note) => note.label === label)
              : (registry.references.get(base + node.from) ??
                local.references.get(node.from));
          if (!note) {
            return false;
          }
          const id = `fn-${nonce}-${replacements.length}`;
          replacements.push({ from: node.from, to: node.to, id, note });
          return false;
        },
      });
      references.set(pass, replacements);
      let source = pass.source;
      for (const replacement of [...replacements].reverse()) {
        source =
          source.slice(0, replacement.from) +
          `<sup data-mw-footnote="${replacement.id}"></sup>` +
          source.slice(replacement.to);
      }
      pass.displaySource = source;
    });
    ctx.on("render/postProcess", (pass) => {
      for (const { id, note } of references.get(pass) ?? []) {
        const sup = pass.container.querySelector<HTMLElement>(
          `[data-mw-footnote="${id}"]`,
        );
        if (!sup) {
          continue;
        }
        const stop = mountReference(
          sup,
          note,
          ctx.render,
          () => {
            if (pass.documentUri) {
              void ctx.rpc
                .call(links, "open", {
                  href: "",
                  source: pass.documentUri,
                  at: note.from,
                  wiki: false,
                  side: false,
                })
                .catch((error) =>
                  ctx.logger.warn("Footnote navigation failed", error),
                );
              return;
            }
            const at = Math.min(view.state.doc.length, note.from);
            view.dispatch({
              selection: { anchor: at },
              effects: EditorView.scrollIntoView(at),
            });
            view.focus();
          },
          pass.measure,
        );
        const cleanup = () => {
          stop();
          sup.textContent = `[^${note.label || note.number}]`;
          cleanups.delete(cleanup);
        };
        cleanups.add(cleanup);
        pass.onDispose(cleanup);
      }
    });
    ctx.effect(() =>
      ctx.commands.register("editor:insert-footnote", () => {
        view.dispatch(insertFootnote(view.state));
        return true;
      }),
    );
  },
};
