import { registerJumpHistory } from "./jump-host";
import { registerGoToLine } from "./go-to-line";
import { registerEditorActions } from "./actions-host";
import { registerMarkdownAssociation } from "./associations";
import { registerToggleTextEditor } from "./toggle-text-editor";
import { SelectionSnapshots } from "./selection";
import type { Manifest } from "../../shared/manifest";
import { captureView, restoreView } from "./view-transfer";
import type { PanelShell } from "../../shared/host";
import type { RootContext, Context, Plugin } from "@workshop/core";
import type {} from "../document/api";
import type {} from "../vault/api";
import type { EditorPanel, Editors } from "./api";
import { createPanel } from "./panel";
import { protocol } from "./protocol";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import { contributionId } from "../../shared/setting-schema";
interface EditorHostConfig {
  features?: readonly Manifest[];
  configure: (context: RootContext, panel: PanelShell) => void;
}
export const editorHost: Plugin<EditorHostConfig> = {
  name: "editor",
  inject: {
    required: [
      "hostDocuments",
      "hostCommands",
      "clipboard",
      "dialogs",
      "settings",
      "customEditors",
      "documents",
      "activeEditor",
    ],
    optional: ["vaults"],
  },
  provides: ["editors", "selections", "editorActions"],
  apply(ctx, config) {
    const panels = new Map<string, EditorPanel>();
    // Panels whose shutdown has not finished, closed ones included: the
    // host's teardown joins them.
    const unfinished = new Set<EditorPanel>();
    const active = () => [...panels.values()].find((panel) => panel.active());
    // Panel notifications stop once the host is stopping: its context is
    // dead and its listeners are going (R3-2).
    const notify = (send: () => void) => {
      if (ctx.isLive) {
        send();
      }
    };
    registerActiveContexts(ctx, config.features ?? [], active);
    registerSelectionContext(ctx, active);
    const setFocus = registerFocusContext(ctx, active);
    const editors = provideEditorServices(ctx, panels, active);
    registerMarkdownAssociation(ctx);
    registerToggleTextEditor(ctx, editors);
    ctx.effect(() =>
      ctx.customEditors.register(MARKDOWN_EDITOR, (shell) => {
        const panel = createPanel(shell, ctx.documents, ctx, {
          onClose: () => {
            panels.delete(shell.id);
            // Inside the panel's shutdown: this joins it. Never rejects.
            void panel.dispose().then(() => unfinished.delete(panel));
            notify(() => ctx.emit("editor/closed", panel));
          },
          onState: () =>
            notify(() => ctx.emit("editor/activeChanged", active())),
          configure(context, panel) {
            // Panel kernels are isolated; share the window-level registry explicitly.
            if (ctx.vaults) {
              context.provide("vaults", ctx.vaults);
            }
            config.configure(context, panel);
          },
          rank: ctx.rankOf,
          logger: ctx.logger,
        });
        panels.set(panel.id, panel);
        unfinished.add(panel);
        panel.rpc.on(protocol, "pluginsChanged", () =>
          notify(() => ctx.emit("editor/pluginsChanged", panel)),
        );
        // The endpoint is disposed with the panel, which removes this listener.
        panel.rpc.on(protocol, "selectionChanged", ({ hasSelection }) =>
          notify(() =>
            ctx.emit("editor/selectionChanged", panel, hasSelection),
          ),
        );
        panel.rpc.on(protocol, "focusChanged", ({ hasFocus }) =>
          notify(() => setFocus(panel, hasFocus)),
        );
        panel.rpc.on(protocol, "initialized", () =>
          notify(() => ctx.emit("editor/ready", panel)),
        );
        ctx.emit("editor/opened", panel);
      }),
    );
    // Teardown waits for every open panel's own cleanup to finish.
    ctx.effect(() => async () => {
      panels.clear();
      await Promise.all([...unfinished].map((panel) => panel.dispose()));
    });
  },
};

function registerActiveContexts(
  ctx: Context,
  features: readonly Manifest[],
  active: () => EditorPanel | undefined,
): void {
  const contexts = () => {
    const panel = active();
    const settings = panel ? ctx.settings.forNote(panel.document) : undefined;
    for (const manifest of features) {
      void ctx.hostCommands.execute(
        "setContext",
        contributionId(`plugin.${manifest.id}`),
        Boolean(
          panel &&
          settings?.preset === "obsidian" &&
          (settings.features?.[manifest.id]?.enabled ??
            manifest.defaultEnabled),
        ),
      );
    }
    for (const id of ["editor", "commands", "livePreview"]) {
      void ctx.hostCommands.execute(
        "setContext",
        contributionId(`plugin.${id}`),
        Boolean(
          active() && (id !== "livePreview" || settings?.preset === "obsidian"),
        ),
      );
    }
  };
  ctx.effect(() => ctx.settings.onChange(contexts));
  ctx.on("editor/activeChanged", contexts);
  ctx.on("editor/opened", contexts);
  ctx.on("editor/closed", contexts);
}

function provideEditorServices(
  ctx: Context,
  panels: Map<string, EditorPanel>,
  active: () => EditorPanel | undefined,
): Editors {
  const editors: Editors = {
    all: () => [...panels.values()],
    active,
    async capture(id) {
      const panel = panels.get(id);
      if (!panel) {
        throw new Error("Editor not found");
      }
      return captureView(panel);
    },
    async restore(id, snapshot) {
      const panel = panels.get(id);
      if (!panel) {
        throw new Error("Editor not found");
      }
      await restoreView(panel, snapshot);
    },
  };
  ctx.provide("editors", editors);
  const selections = new SelectionSnapshots((id) => panels.get(id), ctx);
  ctx.provide("selections", selections);
  registerEditorActions(ctx, editors, selections);
  registerJumpHistory(ctx, editors);
  registerGoToLine(ctx, editors);
  return editors;
}

function registerSelectionContext(
  ctx: Context,
  active: () => EditorPanel | undefined,
): void {
  const setSelection = registerPanelContextKey(
    ctx,
    active,
    contributionId("hasSelection"),
  );
  ctx.on("editor/selectionChanged", setSelection);
}

/**
 * `lumiere.markdown.editorFocus`: whether the active note's webview has
 * focus. The note's keybindings require it (see `focus-report.ts`).
 */
function registerFocusContext(
  ctx: Context,
  active: () => EditorPanel | undefined,
): (panel: { readonly id: string }, hasFocus: boolean) => void {
  return registerPanelContextKey(ctx, active, contributionId("editorFocus"));
}

/**
 * A boolean context key that follows the active panel: each panel keeps its
 * own value, and the key shows the active one's (false when none is).
 * Returns the setter for a panel's value.
 */
function registerPanelContextKey(
  ctx: Context,
  active: () => EditorPanel | undefined,
  key: string,
): (panel: { readonly id: string }, value: boolean) => void {
  const values = new Map<string, boolean>();
  // Captured while live: the cleanup below runs after the context is disposed.
  const commands = ctx.hostCommands;
  const refresh = () => {
    void commands.execute(
      "setContext",
      key,
      values.get(active()?.id ?? "") ?? false,
    );
  };
  ctx.on("editor/closed", (panel) => {
    values.delete(panel.id);
    refresh();
  });
  ctx.on("editor/activeChanged", refresh);
  ctx.effect(() => async () => {
    await commands.execute("setContext", key, false);
  });
  refresh();
  return (panel, value) => {
    values.set(panel.id, value);
    refresh();
  };
}
