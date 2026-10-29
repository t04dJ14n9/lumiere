import { registerJumpRecorder } from "./jump-webview";
import { selectionLayer } from "./selection-layer";
import { afterLayout } from "./layout";
import {
  runNavigation,
  isCurrentReveal,
  revealUnchanged,
  readerStamp,
  sameReader,
} from "./navigation";
import { registerActionMenus } from "./actions-webview";
import { settingsExtensions, editorSettings } from "./settings";
import { config as editorConfig } from "./manifest";
import { ExtensionRegistry } from "./extensions";
import { ViewContributions } from "./contributions";
import { createMenu } from "../../webview/ui/menu";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { getSyncedVersion, sendableUpdates } from "@codemirror/collab";
import type { Context, Plugin, Infer } from "@workshop/core";
import type {} from "../document/api";
import type {} from "../dialect/api";
import { protocol, type viewState } from "./protocol";
import { createEditorService } from "./service";
import { registerViewPersistence } from "./persistence";
import { createViewState } from "./view-state";
import { indentationDom, indentationKeymap } from "./indent-capture";
import { lineStartKeymap } from "./line-start";
import { findExtension, openFind } from "./find";
import { keepFindKey } from "./find-keys";
import { keepSelectAllInEditor } from "./select-all";
import { keepEditKeys } from "./edit-keys";
import {
  defaultKeymap,
  deleteCharBackward,
  selectAll,
} from "@codemirror/commands";
import { getCM } from "@replit/codemirror-vim";
import { caretExtension } from "./caret-view";
import { menuSelectionContext } from "./menu-context";
import { reportWebviewFocus } from "./focus-report";
import { selectionDragScroll } from "./drag-scroll";
import { focusOpensKeyboard } from "../../webview/ui/soft-keyboard";
import { chromeInsetMargins } from "../../webview/ui/chrome-inset";
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
/** More than one caret, as in Obsidian and VS Code; Alt-click adds one. */
const multipleCarets = [
  EditorState.allowMultipleSelections.of(true),
  EditorView.clickAddsSelectionRange.of(
    (event) => event.altKey && !event.metaKey && !event.ctrlKey,
  ),
];

export const editorWebview: Plugin<EditorConfig> = {
  name: "editor",
  inject: { required: ["document", "markdown", "rpc"] },
  provides: ["editor", "menu"],
  reconfigure(ctx, config) {
    const settings = configurations.get(ctx);
    if (!settings) {
      return false;
    }
    settings(editorConfig.parse(config.editor ?? {}));
    return true;
  },
  apply(ctx, config) {
    const presentation = createViewState(ctx);
    const pluginExtensions = new Compartment();
    const settings = new Compartment();
    const modeClass = new Compartment();
    const view = createEditorView(ctx, config, presentation, {
      settings,
      pluginExtensions,
      modeClass,
    });
    ctx.effect(() => () => view.destroy());
    registerSettings(ctx, view, settings);
    ctx.effect(() => ctx.document.attach(view));
    const registry = new ExtensionRegistry(
      ctx.rankOf,
      (extensions, effects = []) =>
        presentation.keepPlace(view, () =>
          view.dispatch({
            effects: [pluginExtensions.reconfigure(extensions), ...effects],
          }),
        ),
    );
    const contributions = new ViewContributions(view, () => registry.flush());
    const editor = createEditorService({
      view,
      registry,
      contributions,
      source: config.source,
      mode: config.mode,
      rpc: ctx.rpc,
      onModeChanged: (mode) =>
        view.dispatch({ effects: modeClass.reconfigure(modeAttributes(mode)) }),
    });
    ctx.on("editor/batchExtensions", (fn) => registry.batch(fn));
    ctx.provide("editor", editor);
    provideMenu(ctx);
    registerActionMenus(ctx);
    registerSyncStatus(ctx, config.parent);

    registerSelectionCapture(ctx, view);
    registerViewPersistence(
      ctx,
      editor,
      { presentation, contributions },
      config,
    );
    registerJumpRecorder(ctx, editor, presentation);
    registerReveal(ctx, view);
    ctx.effect(() => keepSelectAllInEditor(view.dom.ownerDocument));
    registerEditKeyOwnership(ctx, view);
    registerFindKeyOwnership(ctx, view);
    registerWebviewFocus(ctx);
    if (!focusOpensKeyboard()) {
      view.focus();
    }
  },
};

/** Capture Mod/Ctrl+A/X/C/V so Select All / Cut / Copy / Paste beat Vim (BH-029 / BH-032). */
function registerEditKeyOwnership(ctx: Context, view: EditorView): void {
  ctx.effect(() =>
    keepEditKeys(view.dom.ownerDocument, {
      selectAll: () => {
        selectAll(view);
      },
      cut: () => {
        if (view.state.readOnly) {
          return false;
        }
        if (view.state.selection.ranges.every((range) => range.empty)) {
          return false;
        }
        view.focus();
        return view.dom.ownerDocument.execCommand("cut");
      },
      copy: () => {
        if (view.state.selection.ranges.every((range) => range.empty)) {
          return false;
        }
        view.focus();
        return view.dom.ownerDocument.execCommand("copy");
      },
      paste: () => {
        if (view.state.readOnly) {
          return false;
        }
        view.focus();
        return view.dom.ownerDocument.execCommand("paste");
      },
    }),
  );
}

/** Capture Mod/Ctrl+F/H so Find/Replace beat Vim and the workbench (BH-023/025).
 * BH-045: Vim INSERT Ctrl+H deletes the prior character instead of opening Replace. */
function registerFindKeyOwnership(ctx: Context, view: EditorView): void {
  ctx.effect(() =>
    keepFindKey(
      view.dom.ownerDocument,
      (replace) => {
        openFind(view, replace);
      },
      undefined,
      {
        isInsertMode: () => Boolean(getCM(view)?.state.vim?.insertMode),
        onInsertCtrlH: () => {
          deleteCharBackward(view);
        },
      },
    ),
  );
}

function createEditorView(
  ctx: Context,
  config: EditorConfig,
  presentation: ReturnType<typeof createViewState>,
  compartments: {
    settings: Compartment;
    pluginExtensions: Compartment;
    modeClass: Compartment;
  },
): EditorView {
  const { settings, pluginExtensions, modeClass } = compartments;
  return new EditorView({
    parent: config.parent,
    state: EditorState.create({
      doc: config.text,
      extensions: [
        pluginExtensions.of([]),
        settings.of(
          settingsExtensions(editorConfig.parse(config.editor ?? {})),
        ),
        // The stylesheet scopes the main editor's layout to this class, so
        // nested cell editors inside tables keep their own.
        EditorView.editorAttributes.of({ class: "mw-editor" }),
        modeClass.of(modeAttributes(config.mode)),
        presentation.restoreScrollPosition,
        ctx.document.extension,
        ctx.markdown.language(),
        drawSelection(),
        multipleCarets,
        selectionLayer,
        selectionDragScroll,
        caretExtension(),
        findExtension(),
        EditorView.lineWrapping,
        // VS Code's own Cut, Copy and Paste stay in the menu, as in
        // Obsidian's editor menu; they run the browser's clipboard commands,
        // which CodeMirror and the paste plugins already handle.
        EditorView.contentAttributes.of({
          "aria-label": "Markdown content",
          "data-vscode-context": JSON.stringify({
            webviewSection: "markdownContent",
          }),
        }),
        menuSelectionContext,
        chromeInsetMargins,
        Prec.lowest(EditorView.contentAttributes.of({ spellcheck: "false" })),
        // BH-040/047: Tab/Shift+Tab and Mod-[/] via DOM so Vim cannot swallow indent.
        indentationDom(),
        Prec.low(
          keymap.of([
            ...indentationKeymap,
            ...lineStartKeymap,
            ...defaultKeymap,
          ]),
        ),
        reportSelection(ctx),
      ],
    }),
  });
}

/** Tell the host whether there is a selection, for its menus and keys. */
function reportSelection(ctx: Context) {
  // Read once: the editor can run this while the plugin is stopping, when
  // its context refuses reads (packages/core README, "Reading services").
  const rpc = ctx.rpc;
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet || update.focusChanged) {
      const { main } = update.state.selection;
      rpc.notify(
        protocol,
        "selectionChanged",
        {
          hasSelection: !main.empty,
          anchor: main.anchor,
          head: main.head,
        },
        { coalesce: true },
      );
    }
  });
}

/** Source mode shows Markdown in the code font. */
function modeAttributes(mode: "source" | "livePreview") {
  return EditorView.editorAttributes.of({
    class: mode === "source" ? "is-source-mode" : "",
  });
}

function registerSettings(
  ctx: Context,
  view: EditorView,
  settings: Compartment,
): void {
  configurations.set(ctx, (value) => {
    const strictChanged =
      view.state.facet(editorSettings).strictLineBreaks !==
      value.strictLineBreaks;
    view.dispatch({ effects: settings.reconfigure(settingsExtensions(value)) });
    if (strictChanged) {
      ctx.emit("render/changed");
    }
  });
  ctx.effect(() => () => {
    configurations.delete(ctx);
  });
}

function provideMenu(ctx: Context): void {
  const openMenu = createMenu();
  ctx.provide("menu", {
    open(owner, items, point, label) {
      return openMenu({
        owner,
        items,
        point,
        error: (message) => ctx.logger.error(message),
        ...(label === undefined ? {} : { label }),
      });
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
    ctx.rpc.handle(protocol, "captureCursor", async () => {
      await ctx.document.flush();
      return {
        head:
          ctx.bail("editor/projectSelection")?.to ??
          view.state.selection.main.head,
        version: getSyncedVersion(view.state),
      };
    }),
  );
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
    ctx.rpc.handle(
      protocol,
      "reveal",
      async ({ from, to, focus, version, navigation }, token) => {
        if (
          token.cancelled ||
          (navigation !== undefined &&
            !sameReader(navigation, readerStamp(view))) ||
          !isCurrentReveal(
            version,
            getSyncedVersion(view.state),
            sendableUpdates(view.state).length > 0,
          )
        ) {
          return false;
        }
        ctx.emit("editor/clearProjection");
        if (from > to || to > view.state.doc.length) {
          throw new Error("Invalid selection");
        }
        runNavigation(view, () => {
          if (focus && !focusOpensKeyboard()) {
            view.focus();
          }
          view.dispatch({
            selection: { anchor: from, head: to },
            scrollIntoView: true,
          });
        });
        const applied = view.state;
        const stamp = readerStamp(view);
        return (
          (await afterLayout(view)) &&
          !token.cancelled &&
          sameReader(stamp, readerStamp(view)) &&
          revealUnchanged(applied, view.state)
        );
      },
    ),
  );
}

function registerWebviewFocus(ctx: Context): void {
  ctx.effect(() =>
    reportWebviewFocus(window, (hasFocus) =>
      ctx.rpc.notify(
        protocol,
        "focusChanged",
        { hasFocus },
        { coalesce: true },
      ),
    ),
  );
}
