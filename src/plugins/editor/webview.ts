import { settingsExtensions } from "./settings";
import { config as editorConfig } from "./manifest";
import { ExtensionRegistry } from "./extensions";
import { ViewContributions } from "./contributions";
import { createMenu } from "../../webview/ui/menu";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { getSyncedVersion } from "@codemirror/collab";
import type { Context, Plugin } from "../../kernel";
import type {} from "../document/api";
import type {} from "../dialect/api";
import { protocol, type viewState } from "./protocol";
import type { Infer } from "../../kernel";
import { createEditorService } from "./service";
import { registerViewPersistence } from "./persistence";
import { createViewState } from "./view-state";
const configurations = new WeakMap<
  Context,
  (value: Infer<typeof editorConfig>) => void
>();
interface EditorConfig {
  source: string;
  editor?: Infer<typeof editorConfig>;
  saved?: unknown;
  persist?: (state: Infer<typeof viewState>) => void;
  text: string;
  parent: HTMLElement;
  mode: "source" | "livePreview";
}
export const editorWebview: Plugin<EditorConfig> = {
  name: "editor",
  inject: { required: ["document", "markdown", "rpc"] },
  reconfigure(ctx, config) {
    const settings = configurations.get(ctx);
    if (!settings) {
      return false;
    }
    settings(editorConfig.parse(config.editor ?? {}));
    return true;
  },
  apply(ctx, config) {
    const presentation = createViewState();
    const pluginExtensions = new Compartment();
    const settings = new Compartment();
    const view = createEditorView(ctx, config, presentation, {
      settings,
      pluginExtensions,
    });
    ctx.effect(() => () => view.destroy());
    registerSettings(ctx, view, settings);
    ctx.effect(() => ctx.document.attach(view));
    const contributions = new ViewContributions(view);
    const registry = new ExtensionRegistry(ctx.runtime.rank, (extensions) => {
      view.dispatch({ effects: pluginExtensions.reconfigure(extensions) });
    });
    const editor = createEditorService({
      view,
      registry,
      contributions,
      source: config.source,
      mode: config.mode,
      rpc: ctx.rpc,
    });
    ctx.provide("editor", editor);
    provideMenu(ctx);
    registerSyncStatus(ctx, config.parent);

    registerSelectionCapture(ctx, view);
    registerViewPersistence(
      ctx,
      editor,
      { presentation, contributions },
      config,
    );
    registerReveal(ctx, view);
    view.focus();
  },
};

function createEditorView(
  ctx: Context,
  config: EditorConfig,
  presentation: ReturnType<typeof createViewState>,
  compartments: {
    settings: Compartment;
    pluginExtensions: Compartment;
  },
): EditorView {
  const { settings, pluginExtensions } = compartments;
  return new EditorView({
    parent: config.parent,
    state: EditorState.create({
      doc: config.text,
      extensions: [
        pluginExtensions.of([]),
        settings.of(
          settingsExtensions(editorConfig.parse(config.editor ?? {})),
        ),
        presentation.restoreScrollPosition,
        ctx.document.extension,
        ctx.markdown.language(),
        drawSelection(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": "Markdown content" }),
        Prec.lowest(EditorView.contentAttributes.of({ spellcheck: "false" })),
        Prec.low(keymap.of(defaultKeymap)),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.focusChanged) {
            ctx.rpc.notify(protocol, "selectionChanged", {
              hasSelection: !update.state.selection.main.empty,
            });
          }
        }),
      ],
    }),
  });
}

function registerSettings(
  ctx: Context,
  view: EditorView,
  settings: Compartment,
): void {
  configurations.set(ctx, (value) => {
    view.dispatch({
      effects: settings.reconfigure(settingsExtensions(value)),
    });
  });
  ctx.effect(() => () => {
    configurations.delete(ctx);
  });
}

function provideMenu(ctx: Context): void {
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
}

function registerSyncStatus(ctx: Context, parent: HTMLElement): void {
  const status = document.createElement("div");
  status.className = "sync-status";
  status.setAttribute("role", "status");
  parent.append(status);
  ctx.effect(() => () => status.remove());
  ctx.on("document/syncStatus", (message) => {
    status.textContent = message;
  });
}

function registerSelectionCapture(ctx: Context, view: EditorView): void {
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
}

function registerReveal(ctx: Context, view: EditorView): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "reveal", ({ from, to, focus }) => {
      ctx.emit("editor/clearProjection");
      if (from > to || to > view.state.doc.length) {
        throw new Error("Invalid selection");
      }
      view.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
      if (focus) {
        view.focus();
      }
      return true;
    }),
  );
}
