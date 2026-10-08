import { bindCaller } from "../../kernel";
import type { CallerBound } from "../../kernel";
import { ExtensionRegistry } from "./extensions";
import { foldState, foldedRanges } from "@codemirror/language";
import { createMenu } from "../../webview/ui/menu";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { getSyncedVersion } from "@codemirror/collab";
import type { Plugin } from "../../kernel";
import type {} from "../document/api";
import type {} from "../dialect/api";
import type { EditorService } from "./api";
import { protocol, viewState } from "./protocol";
import type { Infer } from "../../kernel";
import { createClipboard } from "./clipboard";
import { createViewState } from "./view-state";
export const editorWebview: Plugin<{
  source: string;
  saved?: unknown;
  persist?: (state: Infer<typeof viewState>) => void;
  text: string;
  parent: HTMLElement;
  mode: "source" | "livePreview";
}> = {
  name: "editor",
  inject: { required: ["document", "markdown", "rpc"] },
  apply(ctx, config) {
    const presentation = createViewState(),
      folds = new Map<string, boolean>();
    const pluginExtensions = new Compartment();
    let mode = config.mode;
    const view = new EditorView({
      parent: config.parent,
      state: EditorState.create({
        doc: config.text,
        extensions: [
          pluginExtensions.of([]),
          presentation.restoreScrollPosition,
          foldState,
          ctx.document.extension,
          ctx.markdown.language(),
          drawSelection(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Markdown content" }),
          Prec.lowest(EditorView.contentAttributes.of({ spellcheck: "false" })),
          Prec.low(keymap.of(defaultKeymap)),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.focusChanged)
              ctx.rpc.notify(protocol, "selectionChanged", {
                hasSelection: !update.state.selection.main.empty,
              });
          }),
        ],
      }),
    });
    ctx.effect(() => () => view.destroy());
    ctx.effect(() => ctx.document.attach(view));
    const registry = new ExtensionRegistry(ctx.runtime.rank, (extensions) => {
      view.dispatch({ effects: pluginExtensions.reconfigure(extensions) });
    });
    const editor: EditorService & CallerBound<EditorService> = {
      [bindCaller](caller) {
        return new Proxy(editor, {
          get(target, key, receiver) {
            if (key === "extend") return (extension: Parameters<EditorService["extend"]>[0], options?: Parameters<EditorService["extend"]>[1]) =>
              registry.register(options?.owner ?? caller.fiber!.definition.name, extension, options?.slot);
            return Reflect.get(target, key, receiver);
          },
        });
      },
      view,
      clipboard: createClipboard(ctx.rpc),
      folds,
      get mode() {
        return mode;
      },
      set mode(value) {
        mode = value;
      },
      focus() {
        view.focus();
      },
      extend(extension, options) {
        return registry.register(options?.owner ?? "editor", extension, options?.slot);
      },
    };
    ctx.provide("editor", editor);
    const openMenu = createMenu();
    ctx.provide("menu", {
      open(owner, items, point, label) {
        return openMenu(
          owner,
          items,
          point,
          (message) => ctx.logger.error(message),
          label,
        );
      },
    });
    const status = document.createElement("div");
    status.className = "sync-status";
    status.setAttribute("role", "status");
    config.parent.append(status);
    ctx.effect(() => () => status.remove());
    ctx.on("document/syncStatus", (message) => {
      status.textContent = message;
    });

    ctx.effect(() =>
      ctx.rpc.handle(protocol, "captureSelection", async () => {
        await ctx.document.flush();
        const { from, to } =
          ctx.bail("editor/projectSelection") ?? view.state.selection.main;
        return {
          from,
          to,
          version: getSyncedVersion(view.state),
          text: view.state.sliceDoc(from, to),
        };
      }),
    );
    const capture = () => {
      const folded: { from: number; to: number }[] = [];
      foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
        folded.push({ from, to });
      });
      return {
        source: config.source,
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
        folded,
        folds: Object.fromEntries(folds),
        mode,
      };
    };
    const restore = (state: Infer<typeof viewState>) => {
      mode = state.mode;
      folds.clear();
      for (const [key, open] of Object.entries(state.folds))
        folds.set(
          state.source && key.startsWith(state.source + "|")
            ? config.source + key.slice(state.source.length)
            : key,
          open,
        );
      presentation.restoreViewState(view, state);
      ctx.emit("editor/modeRestored", state.mode);
    };
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "captureView", async () => {
        await ctx.document.flush();
        return presentation.captureViewState(view, capture());
      }),
    );
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "restoreView", (state) => {
        restore(state);
        return true;
      }),
    );
    ctx.effect(() =>
      editor.extend(
        EditorView.updateListener.of((update) => {
          if (
            update.selectionSet ||
            update.docChanged ||
            update.transactions.some((tr) => tr.effects.length > 0)
          )
            config.persist?.(capture());
        }),
      ),
    );
    ctx.effect(() => {
      const save = () => config.persist?.(capture());
      view.scrollDOM.addEventListener("scroll", save);
      return () => view.scrollDOM.removeEventListener("scroll", save);
    });
    if (config.saved) {
      try {
        const saved = viewState.parse(config.saved);
        if (saved.source === config.source) restore(saved);
      } catch (error) {
        ctx.logger.warn("Ignored invalid saved view state", error);
      }
    }
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "reveal", ({ from, to, focus }) => {
        ctx.emit("editor/clearProjection");
        if (from > to || to > view.state.doc.length)
          throw new Error("Invalid selection");
        view.dispatch({
          selection: { anchor: from, head: to },
          scrollIntoView: true,
        });
        if (focus) view.focus();
        return true;
      }),
    );
    view.focus();
  },
};
