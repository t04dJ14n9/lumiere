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
import { PropertyWidget } from "./widget";
import { propertyHeadingFocus } from "./heading";
import type { PropertyContext } from "./context";
import { styles } from "./styles";
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
    const view = ctx.editor.view;
    const lifetime = new AbortController();
    ctx.effect(() => () => lifetime.abort());
    const refresh = () => {
      if (!lifetime.signal.aborted) {
        ctx.emit("render/changed");
      }
    };
    const heading = propertyHeadingFocus(() => {
      ctx.bail("editor/focusTitle");
    });
    let display = settings.display;
    let removeRenderer: (() => void | Promise<void>) | undefined;
    const install = () => {
      void removeRenderer?.();
      removeRenderer = ctx.livePreview.block({
        kind: "properties",
        editing: display === "hidden" ? "reveal" : "widget",
        match: (node) => display !== "source" && node.name === "Frontmatter",
        widget: (block) =>
          new PropertyWidget(block.source, context, display === "hidden"),
      });
    };
    const editing = new PropertyEditing(
      () => (lifetime.signal.aborted ? undefined : view),
      (message) => ctx.logger.warn(message),
      (action) => {
        void ctx.rpc
          .call(actions, "action", { action })
          .catch((error) => ctx.logger.error("Property action failed", error));
      },
      refresh,
      (key, kind) => {
        void ctx.rpc
          .call(protocol, "setType", { key, kind: kind ?? undefined })
          .then((types) => {
            if (!lifetime.signal.aborted) {
              editing.receiveTypes({ types });
            }
          })
          .catch((error) =>
            ctx.logger.error("Property preference failed", error),
          );
      },
      () => {
        ctx.emit("editor/clearProjection");
        display = "visible";
        install();
      },
      () => {
        ctx.bail("editor/focusTitle");
      },
      (backward) => view.plugin(heading)?.page(backward),
      lifetime.signal,
    );
    const context: PropertyContext = {
      source: "current",
      propertyEditor: editing.editor("current"),
      copy: (text) => {
        void ctx.editor.clipboard
          .write(text)
          .catch((error) => ctx.logger.error("Copy failed", error));
      },
      openMenu: (owner, items, point, _report, label) => {
        const stop = ctx.menu.open(owner, items, point, label);
        return () => {
          void stop();
        };
      },
    };
    configurations.set(ctx, (settings) => {
      display = settings.display;
      install();
    });
    ctx.effect(() => () => {
      configurations.delete(ctx);
    });
    ctx.effect(() =>
      ctx.editor.extend([
        heading,
        EditorView.baseTheme(styles),
        keymap.of([
          {
            key: "Mod-;",
            run: () => {
              editing.add();
              return true;
            },
          },
        ]),
      ]),
    );
    ctx.effect(() => {
      install();
      return () => removeRenderer?.();
    });
    ctx.effect(() =>
      ctx.commands.register("markdown:add-metadata-property", () => {
        editing.add();
        return true;
      }),
    );
    ctx.effect(() =>
      ctx.rpc.on(protocol, "types", (types) => editing.receiveTypes({ types })),
    );
    void ctx.rpc
      .call(protocol, "types", {})
      .then((types) => {
        if (!lifetime.signal.aborted) {
          editing.receiveTypes({ types });
        }
      })
      .catch((error) =>
        ctx.logger.warn("Property preferences unavailable", error),
      );
    if (ctx.document.beforeFlush) {
      ctx.effect(() =>
        ctx.document.beforeFlush!(() => {
          const inputs = view.dom.querySelectorAll<HTMLInputElement>(
            ".hybrid-properties input",
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
  },
};
