import type { Context, Plugin } from "../../kernel";
import { serializeTable } from "../../markdown/tables/model";
import type {} from "../editor/api";
import type {} from "../document/api";
import type {} from "../dialect/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import type {} from "../commands/api";
import type {} from "../formatting/api";
import type {} from "../vim/api";
import { protocol as editorProtocol } from "../editor/protocol";
import { keymap } from "@codemirror/view";
import { TableWidget, enterTable } from "./widget";
import {
  activeTables,
  tableActions,
  tableSelection,
  tableSelectionChanges,
} from "./state";
import type { TableEnvironment } from "./environment";
import { TableContent } from "./content";
import { tableCommands } from "./manifest";
import { tableOperation } from "./commands";
import { vimTableEntry } from "./vim-entry";
export const tablesWebview: Plugin = {
  name: "tables",
  inject: {
    required: [
      "editor",
      "document",
      "markdown",
      "livePreview",
      "render",
      "commands",
      "menu",
      "rpc",
    ],
    optional: ["vim", "formatting"],
  },
  apply(ctx) {
    const environment = createEnvironment(ctx);
    registerTableExtensions(ctx);
    registerVimTableEntry(ctx);
    registerTableRenderer(ctx, environment);
    registerTableSelection(ctx);
    registerTableCommands(ctx);
  },
};

function registerVimTableEntry(ctx: Context): void {
  ctx.effect(() => ctx.editor.extend(vimTableEntry(() => ctx.vim)));
}

function createEnvironment(ctx: Context): TableEnvironment {
  const content = new TableContent(ctx.editor.view, ctx.render, ctx.logger);
  ctx.effect(() => () => content.dispose());
  return {
    language: ctx.markdown.language(),
    vim: ctx.vim,
    inputGroups: () => {
      const groups = ctx.document.inputGroups?.((target) =>
        ctx.vim?.mode(target),
      );
      if (!groups) {
        throw new Error("Document input grouping is unavailable");
      }
      return groups;
    },
    disposeContent: (element) => content.disposeContent(element),
    renderContent: (element, source, offset) =>
      content.renderContent(element, source, offset),
    position: (source, element, point) =>
      ctx.livePreview.position?.(source, element, point),
    wrap: (marker, target) => ctx.formatting?.wrap(marker, target) ?? false,
    canFormat: ctx.formatting !== undefined,
    clearFormatting: (source) => ctx.formatting?.clear(source) ?? source,
    openMenu: (owner, items, point) => {
      let live = true;
      let stop: (() => void | Promise<void>) | undefined;
      void ctx.pipeline("editor/selectionMenu", items).then((items) => {
        if (live) {
          stop = ctx.menu.open(owner, items, point, "Table actions");
        }
      });
      return () => {
        live = false;
        void stop?.();
      };
    },
    copy: (text) => {
      void ctx.editor.clipboard
        .write(text)
        .catch((error) => ctx.logger.error("Copy failed", error));
    },
    paste: () => ctx.editor.clipboard.read(),
  };
}

function registerTableExtensions(ctx: Context): void {
  ctx.effect(() =>
    ctx.editor.extend(
      [
        keymap.of([
          { key: "ArrowUp", run: (view) => enterTable(view, -1) },
          { key: "ArrowDown", run: (view) => enterTable(view, 1) },
        ]),
        tableActions.of((action) => {
          void ctx.commands.run(action);
        }),
        tableSelectionChanges.of((hasSelection) =>
          ctx.rpc.notify(
            editorProtocol,
            "selectionChanged",
            { hasSelection },
            { coalesce: true },
          ),
        ),
      ],
      { slot: "override" },
    ),
  );
}

function registerTableRenderer(
  ctx: Context,
  environment: TableEnvironment,
): void {
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "Table",
      nodes: ["Table"],
      editing: "widget",
      match: (node) => node.name === "Table",
      widget: (block) => new TableWidget(block, 0, environment),
    }),
  );
}

function registerTableSelection(ctx: Context): void {
  const view = ctx.editor.view;
  ctx.on("editor/clearProjection", () => {
    const controller = activeTables.get(view);
    if (controller) {
      controller.close();
      controller.range = undefined;
      controller.highlight();
      activeTables.delete(view);
    }
  });
  ctx.on("editor/projectSelection", () => tableSelection(view));
  ctx.on("editor/activeView", () => activeTables.get(view)?.editor);
}

function registerTableCommands(ctx: Context): void {
  const view = ctx.editor.view;
  ctx.effect(() =>
    ctx.commands.register("editor:insert-table", () => {
      view.dispatch({
        ...view.state.replaceSelection(
          "\n\n" +
            serializeTable(
              [
                ["Column 1", "Column 2"],
                ["", ""],
              ],
              [null, null],
            ) +
            "\n\n",
        ),
        userEvent: "input",
      });
      return true;
    }),
  );
  for (const [id] of tableCommands) {
    ctx.effect(() =>
      ctx.commands.register("editor:table-" + id, () => {
        const controller = activeTables.get(view);
        const position = controller?.range?.head ?? controller?.active;
        if (!controller || !position) {
          return false;
        }
        const operation = tableOperation(id, position);
        if (!operation) {
          return false;
        }
        controller.execute(operation, position);
        return true;
      }),
    );
  }
}
