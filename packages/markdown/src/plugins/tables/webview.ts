import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../document/api";
import type {} from "../dialect/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import type {} from "../commands/api";
import type {} from "../formatting/api";
import type {} from "../vim/api";
import type {} from "../links/api";
import { protocol as editorProtocol } from "../editor/protocol";
import { keymap } from "@codemirror/view";
import {
  TableWidget,
  enableTableRetention,
  enterTable,
  evictDisconnectedTables,
} from "./widget";
import {
  activeTables,
  tableActions,
  tableSelection,
  tableSelectionChanges,
} from "./state";
import type { TableEnvironment } from "./environment";
import { TableContent } from "./content";
import { tableCommands } from "./manifest";
import { insertTable, tableOperation } from "./commands";
import { vimTableEntry } from "./vim-entry";
import { listenForTableWheel } from "./scroll-input";
import { extendTableRangeForWidths } from "./column-widths";
import { cellPointerOffset } from "./cell-pointer";
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
    optional: ["vim", "formatting", "links"],
  },
  apply(ctx) {
    const environment = createEnvironment(ctx);
    registerTableExtensions(ctx);
    registerTableWheelInput(ctx);
    registerVimTableEntry(ctx);
    registerTableRenderer(ctx, environment);
    registerTableSelection(ctx);
    registerTableCommands(ctx);
  },
};

function registerVimTableEntry(ctx: Context): void {
  ctx.effect(() => ctx.editor.extend(vimTableEntry(ctx.vim)));
}

function createEnvironment(ctx: Context): TableEnvironment {
  const content = new TableContent(ctx.editor.view, ctx.render, ctx.logger);
  ctx.effect(() => () => content.dispose());
  // Read once: the table widgets call these closures from the editor, which
  // can run while this plugin is stopping, when its context refuses reads.
  // An optional service coming or going restarts the plugin.
  const { document, vim, livePreview, formatting, menu, editor } = ctx;
  return {
    language: ctx.markdown.language(),
    vim,
    links: ctx.links,
    inputGroups: () => {
      const groups = document.inputGroups?.((target) => vim?.mode(target));
      if (!groups) {
        throw new Error("Document input grouping is unavailable");
      }
      return groups;
    },
    disposeContent: (element) => content.disposeContent(element),
    renderContent: (element, source, offset) =>
      content.renderContent(element, source, offset),
    position: (source, element, point) =>
      cellPointerOffset(source, element, point, livePreview.position),
    wrap: (marker, target) => formatting?.wrap(marker, target) ?? false,
    canFormat: formatting !== undefined,
    clearFormatting: (source) => formatting?.clear(source) ?? source,
    openMenu: (owner, items, point) => {
      let live = true;
      let stop: (() => void | Promise<void>) | undefined;
      void ctx.pipeline("editor/selectionMenu", items).then((items) => {
        if (live) {
          stop = menu.open(owner, items, point, "Table actions");
        }
      });
      return () => {
        live = false;
        void stop?.();
      };
    },
    copy: (text) => {
      void editor.clipboard
        .write(text)
        .catch((error) => ctx.logger.error("Copy failed", error));
    },
    paste: () => editor.clipboard.read(),
  };
}

function registerTableWheelInput(ctx: Context): void {
  const view = ctx.editor.view;
  ctx.effect(() =>
    listenForTableWheel(view.dom, () => ctx.emit("editor/scrollInput", view)),
  );
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
  ctx.effect(() => enableTableRetention(environment));
  ctx.on("render/changed", () => evictDisconnectedTables(environment));
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "Table",
      nodes: ["Table"],
      editing: "widget",
      match: (node) => node.name === "Table",
      range: (node, state) => {
        if (node.to >= state.doc.length) {
          return { from: node.from, to: node.to };
        }
        const next = state.doc.lineAt(Math.min(state.doc.length, node.to + 1));
        if (next.from !== node.to + 1) {
          return { from: node.from, to: node.to };
        }
        return extendTableRangeForWidths(
          next.text,
          node.from,
          node.to,
          next.to,
        );
      },
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
      view.dispatch(insertTable(view.state));
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
