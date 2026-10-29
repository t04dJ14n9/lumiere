import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { Context, Plugin, Infer } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../document/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import type {} from "./api";
import { protocol as actions } from "../commands/protocol";
import { config } from "./manifest";
import { listPreviewCount } from "../../markdown/properties/list-preview";
import { protocol } from "./protocol";
import { PropertyEditing } from "./editing";
import { PropertyPresentation } from "./presentation";
import { propertyHeadingFocus } from "./heading";
import { frontmatterBodyStart, propertyCaretGuard } from "./caret-guard";
import { noteCssClassesExtension, registerVaultSnippets } from "./css-classes";
import type { PropertyContext } from "./context";
import { createPropertyRenderers } from "./renderers";
import type {} from "./renderers";
import type { PropertyKind } from "../../markdown/properties/types";

const configurations = new WeakMap<
  Context,
  (settings: Infer<typeof config>) => void
>();
export const propertiesWebview: Plugin<Infer<typeof config>> = {
  name: "properties",
  provides: ["propertyRenderers"],
  config,
  reconfigure(ctx, settings) {
    const configure = configurations.get(ctx);
    if (!configure) {
      return false;
    }
    configure(settings);
    return true;
  },
  inject: {
    required: ["editor", "commands", "livePreview", "rpc", "document", "menu"],
  },
  apply(ctx, settings) {
    let refreshRenderers = () => {};
    const renderers = createPropertyRenderers(() => refreshRenderers());
    ctx.provide("propertyRenderers", renderers);
    let previewCount = listPreviewCount(settings.listPreviewCount);
    const expandedLists = new Set<string>();
    registerFocusProperties(ctx);
    const lifetime = new AbortController();
    ctx.effect(() => () => lifetime.abort());
    const heading = propertyHeadingFocus(() => {
      ctx.bail("editor/focusTitle");
    });
    const editing = createEditing(ctx, lifetime.signal, {
      show: () => {
        ctx.emit("editor/clearProjection");
        presentation.show(ctx.editor.view);
      },
      pageHeading: (backward) =>
        ctx.editor.view.plugin(heading)?.page(backward),
      refreshEmpty: () => presentation.reconcileEmpty(),
    });
    const presentation = new PropertyPresentation(
      ctx.livePreview,
      createSheetContext(ctx, editing, renderers, {
        listPreviewCount: () => previewCount,
        expandedLists: () => expandedLists,
        expandList: (key) => {
          expandedLists.add(key);
        },
      }),
      settings.display,
    );
    refreshRenderers = () => {
      // Teardown can unregister a renderer after this context has stopped.
      if (!ctx.isLive) {
        return;
      }
      ctx.emit("render/changed");
      presentation.reconcileEmpty();
    };
    registerConfiguration(ctx, presentation, (next) => {
      previewCount = listPreviewCount(next.listPreviewCount);
    });
    registerEmptySheet(ctx, presentation);
    registerEditorControls(ctx, { heading, editing, presentation });
    ctx.effect(() => {
      presentation.install();
      return () => presentation.dispose();
    });
    registerAddProperty(ctx, editing);
    registerPreferences(ctx, editing, lifetime.signal);
    registerDisclosure(ctx, editing, lifetime.signal);
    registerVaultSnippets(ctx, lifetime.signal);
    registerDraftFlush(ctx);
  },
};

function registerFocusProperties(ctx: Context): void {
  ctx.on("editor/focusProperties", () => {
    const heading = ctx.editor.view.contentDOM.querySelector<HTMLElement>(
      ".hybrid-properties [data-properties-heading]",
    );
    if (!heading?.getClientRects().length) {
      return undefined;
    }
    heading.focus();
    return true;
  });
}

function createEditing(
  ctx: Context,
  signal: AbortSignal,
  navigation: {
    show(): void;
    pageHeading(backward: boolean): void;
    refreshEmpty(): void;
  },
): PropertyEditing {
  const view = ctx.editor.view;
  const editing = new PropertyEditing({
    view: () => (signal.aborted ? undefined : view),
    setStatus: (message) => ctx.logger.warn(message),
    action: (action) => {
      void ctx.rpc
        .call(actions, "action", { action })
        .catch((error) => ctx.logger.error("Property action failed", error));
    },
    refresh: () => {
      if (!signal.aborted) {
        ctx.emit("render/changed");
        navigation.refreshEmpty();
      }
    },
    setType: (key, kind) =>
      setPropertyType(ctx, { key, kind, editing, signal }),
    show: () => navigation.show(),
    focusTitle: () => {
      ctx.bail("editor/focusTitle");
    },
    pageHeading: (backward) => navigation.pageHeading(backward),
    propertyNames: () => ctx.rpc.call(protocol, "names", {}),
    setCollapsed: (collapsed) => {
      void ctx.rpc
        .call(protocol, "setCollapsed", { collapsed })
        .catch((error) =>
          ctx.logger.error("Property disclosure failed", error),
        );
    },
    signal,
  });
  return editing;
}

function registerEmptySheet(
  ctx: Context,
  presentation: PropertyPresentation,
): void {
  ctx.effect(() =>
    ctx.editor.extend(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          presentation.reconcileEmpty();
        }
      }),
    ),
  );
}

function setPropertyType(
  ctx: Context,
  options: {
    key: string;
    kind: PropertyKind | null;
    editing: PropertyEditing;
    signal: AbortSignal;
  },
): void {
  const { key, kind, editing, signal } = options;
  void ctx.rpc
    .call(protocol, "setType", { key, ...(kind === null ? {} : { kind }) })
    .then((types) => {
      if (!signal.aborted) {
        editing.receiveTypes({ types });
      }
    })
    .catch((error) => ctx.logger.error("Property preference failed", error));
}

function createSheetContext(
  ctx: Context,
  editing: PropertyEditing,
  renderers: ReturnType<typeof createPropertyRenderers>,
  listUi: {
    listPreviewCount(): number;
    expandedLists(): ReadonlySet<string>;
    expandList(key: string): void;
  },
): PropertyContext {
  return {
    renderProperty: (key, value, values) =>
      renderers.render(key, value, values),
    bindRenderedProperties: (root) => renderers.bind(root),
    source: "current",
    propertyEditor: editing.editor("current"),
    listPreviewCount: listUi.listPreviewCount,
    expandedLists: listUi.expandedLists,
    expandList: listUi.expandList,
    readClipboard: () => ctx.editor.clipboard.read(),
    copy: (text) => {
      void ctx.editor.clipboard
        .write(text)
        .catch((error) => ctx.logger.error("Copy failed", error));
    },
    openMenu: (...args) => {
      const [owner, items, point, , label] = args;
      const stop = ctx.menu.open(owner, items, point, label);
      return () => {
        void stop();
      };
    },
  };
}

function registerConfiguration(
  ctx: Context,
  presentation: PropertyPresentation,
  onSettings: (settings: Infer<typeof config>) => void,
): void {
  configurations.set(ctx, (settings) => {
    presentation.configure(settings.display);
    onSettings(settings);
  });
  ctx.effect(() => () => {
    configurations.delete(ctx);
  });
}

function registerEditorControls(
  ctx: Context,
  options: {
    heading: ReturnType<typeof propertyHeadingFocus>;
    editing: PropertyEditing;
    presentation: PropertyPresentation;
  },
): void {
  const view = ctx.editor.view;
  const { presentation } = options;
  ctx.effect(() => {
    const stop = ctx.editor.extend([
      noteCssClassesExtension(),
      options.heading,
      propertyCaretGuard(() => presentation.isWidget),
      Prec.high(
        keymap.of([
          {
            key: "ArrowUp",
            run: (target) => enterProperties(target, presentation, options),
          },
          // Unhandled, the browser would move its own caret up into the block's
          // editable pill inputs.
          ...["Ctrl-ArrowUp", "Shift-Ctrl-ArrowUp"].map((key) => ({
            key,
            run: (target: EditorView) => onFirstBodyLine(target, presentation),
          })),
        ]),
      ),
      keymap.of([
        {
          key: "Mod-;",
          run: () => {
            options.editing.add();
            return true;
          },
        },
      ]),
    ]);
    // A note opens with the caret at 0, which is inside the block.
    if (frontmatterBodyStart(view.state.doc) !== undefined) {
      ctx.editor.flush?.();
      view.dispatch({ selection: view.state.selection });
    }
    return stop;
  });
}

/** The caret is on the first visual row of the body, just under the Properties block. */
function onFirstBodyLine(
  view: EditorView,
  presentation: PropertyPresentation,
): boolean {
  const start = frontmatterBodyStart(view.state.doc);
  const { main } = view.state.selection;
  if (!presentation.isWidget || start === undefined) {
    return false;
  }
  if (view.state.doc.lineAt(main.head).from !== start) {
    return false;
  }
  const top = view.coordsAtPos(start)?.top;
  const here = view.coordsAtPos(main.head)?.top;
  return top !== undefined && here !== undefined && here - top <= 2;
}

/** ArrowUp on the body's first visual line leaves the text for the Properties block. */
function enterProperties(
  view: EditorView,
  presentation: PropertyPresentation,
  options: { heading: ReturnType<typeof propertyHeadingFocus> },
): boolean {
  const start = frontmatterBodyStart(view.state.doc);
  if (
    start === undefined ||
    !view.state.selection.main.empty ||
    !onFirstBodyLine(view, presentation)
  ) {
    return false;
  }
  view.dispatch({ selection: { anchor: start } });
  view.plugin(options.heading)?.enter();
  return true;
}

function registerAddProperty(ctx: Context, editing: PropertyEditing): void {
  ctx.effect(() =>
    ctx.commands.register("markdown:add-metadata-property", () => {
      editing.add();
      return true;
    }),
  );
  ctx.effect(() =>
    ctx.commands.register("markdown:add-alias", () => {
      editing.addAlias();
      return true;
    }),
  );
  ctx.effect(() =>
    ctx.commands.register("markdown:clear-metadata-properties", () =>
      editing.clear(),
    ),
  );
  // As in Obsidian: collapse or expand the note's Properties, as their
  // heading does when clicked (which also remembers it for the note).
  ctx.effect(() =>
    ctx.commands.register("editor:toggle-fold-properties", () => {
      const heading = ctx.editor.view.dom.querySelector<HTMLElement>(
        "[data-properties-heading]",
      );
      heading?.click();
      return heading !== null;
    }),
  );
}

function registerPreferences(
  ctx: Context,
  editing: PropertyEditing,
  signal: AbortSignal,
): void {
  ctx.effect(() =>
    ctx.rpc.on(protocol, "types", (types) => editing.receiveTypes({ types })),
  );
  void ctx.rpc
    .call(protocol, "types", {})
    .then((types) => {
      if (!signal.aborted) {
        editing.receiveTypes({ types });
      }
    })
    .catch((error) =>
      ctx.logger.warn("Property preferences unavailable", error),
    );
}

function registerDraftFlush(ctx: Context): void {
  const view = ctx.editor.view;
  if (!ctx.document.beforeFlush) {
    return;
  }
  ctx.effect(() =>
    ctx.document.beforeFlush!(() => {
      const inputs = view.dom.querySelectorAll<HTMLElement>(
        ".hybrid-properties input, .hybrid-properties textarea, .hybrid-properties [contenteditable]",
      );
      for (const input of inputs) {
        if (
          input.isConnected &&
          !input.dispatchEvent(
            new Event("property-commit", { cancelable: true }),
          )
        ) {
          throw new Error(
            "Finish or cancel the invalid property draft before saving.",
          );
        }
      }
    }),
  );
}

function registerDisclosure(
  ctx: Context,
  editing: PropertyEditing,
  signal: AbortSignal,
): void {
  ctx.effect(() =>
    ctx.rpc.on(protocol, "collapsed", (collapsed) =>
      editing.receiveCollapsed(collapsed),
    ),
  );
  void ctx.rpc
    .call(protocol, "collapsed", {})
    .then((c) => !signal.aborted && editing.receiveCollapsed(c))
    .catch((err) => ctx.logger.warn("Property disclosure unavailable", err));
}
