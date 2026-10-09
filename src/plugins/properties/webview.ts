import { EditorView, keymap } from "@codemirror/view";
import type { Context, Plugin, Infer } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../document/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import type {} from "./api";
import { protocol as actions } from "../commands/protocol";
import { config } from "./manifest";
import { protocol } from "./protocol";
import { PropertyEditing } from "./editing";
import { PropertyPresentation } from "./presentation";
import { propertyHeadingFocus } from "./heading";
import type { PropertyContext } from "./context";
import type { PropertyKind } from "../../markdown/properties/types";

const configurations = new WeakMap<
  Context,
  (settings: Infer<typeof config>) => void
>();
export const propertiesWebview: Plugin<Infer<typeof config>> = {
  name: "properties",
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
      createSheetContext(ctx, editing),
      settings.display,
    );
    registerConfiguration(ctx, presentation);
    registerEmptySheet(ctx, presentation);
    registerEditorControls(ctx, { heading, editing });
    ctx.effect(() => {
      presentation.install();
      return () => presentation.dispose();
    });
    registerAddProperty(ctx, editing);
    registerPreferences(ctx, editing, lifetime.signal);
    registerDisclosure(ctx, editing, lifetime.signal);
    registerDraftFlush(ctx);
  },
};

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
): PropertyContext {
  return {
    source: "current",
    propertyEditor: editing.editor("current"),
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
): void {
  configurations.set(ctx, (settings) =>
    presentation.configure(settings.display),
  );
  ctx.effect(() => () => {
    configurations.delete(ctx);
  });
}

function registerEditorControls(
  ctx: Context,
  options: {
    heading: ReturnType<typeof propertyHeadingFocus>;
    editing: PropertyEditing;
  },
): void {
  ctx.effect(() =>
    ctx.editor.extend([
      options.heading,
      keymap.of([
        {
          key: "Mod-;",
          run: () => {
            options.editing.add();
            return true;
          },
        },
      ]),
    ]),
  );
}

function registerAddProperty(ctx: Context, editing: PropertyEditing): void {
  ctx.effect(() =>
    ctx.commands.register("markdown:add-metadata-property", () => {
      editing.add();
      return true;
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
        ".hybrid-properties input, .hybrid-properties [contenteditable]",
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
    .then((collapsed) => {
      if (!signal.aborted) {
        editing.receiveCollapsed(collapsed);
      }
    })
    .catch((error) =>
      ctx.logger.warn("Property disclosure unavailable", error),
    );
}
