import { EditorView } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../document/api";
import type {} from "../dialect/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import type {} from "../commands/api";
import type {} from "../formatting/api";
import type {} from "../vim/api";
import { protocol as editorProtocol } from "../editor/protocol";
import { TableWidget } from "./widget";
import {
  activeTables,
  tableActions,
  tableSelection,
  tableSelectionChanges,
  tableSource,
} from "./state";
import type { TableEnvironment } from "./environment";
import type { RenderPass } from "../render/api";
import { tableCommands } from "./manifest";
import { tableOperation } from "./commands";
import { styles } from "./styles";
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
    const view = ctx.editor.view;
    const passes = new Map<
      HTMLElement,
      { pass?: RenderPass; abort: AbortController }
    >();
    let live = true;
    const disposeContent = (element: HTMLElement) => {
      const entry = passes.get(element);
      entry?.abort.abort();
      passes.delete(element);
      void entry?.pass?.dispose();
    };
    const environment: TableEnvironment = {
      language: ctx.markdown.language(),
      inline: ctx.livePreview.inlineExtensions?.() ?? [],
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
      disposeContent,
      renderContent(element, source, offset) {
        disposeContent(element);
        const entry: { pass?: RenderPass; abort: AbortController } = {
          abort: new AbortController(),
        };
        passes.set(element, entry);
        void ctx.render
          .into(element, source, {
            signal: entry.abort.signal,
            sourceLine: view.state.doc.lineAt(offset).number - 1,
            measure: () => {
              if (live) {
                view.requestMeasure();
              }
            },
          })
          .then((pass) => {
            if (!live || passes.get(element) !== entry) {
              void pass.dispose();
            } else {
              entry.pass = pass;
            }
          })
          .catch((error) => ctx.logger.error("Table rendering failed", error));
      },
      position: (source, element, point) =>
        ctx.livePreview.position?.(source, element, point),
      wrap: (marker, target) => ctx.formatting?.wrap(marker, target) ?? false,
      clearFormatting: (source) => ctx.formatting?.clear(source) ?? source,
      openMenu: (owner, items, point) => {
        const stop = ctx.menu.open(owner, items, point, "Table actions");
        return () => {
          void stop();
        };
      },
      copy: (text) => {
        void ctx.editor.clipboard
          .write(text)
          .catch((error) => ctx.logger.error("Copy failed", error));
      },
      paste: () => ctx.editor.clipboard.read(),
    };
    ctx.effect(() => () => {
      live = false;
      for (const element of passes.keys()) {
        disposeContent(element);
      }
    });
    ctx.effect(() =>
      ctx.editor.extend(
        [
          tableSource,
          EditorView.baseTheme(styles),
          tableActions.of((action) => {
            void ctx.commands.run(action);
          }),
          tableSelectionChanges.of((hasSelection) =>
            ctx.rpc.notify(editorProtocol, "selectionChanged", {
              hasSelection,
            }),
          ),
        ],
        { slot: "override" },
      ),
    );
    ctx.effect(() =>
      ctx.livePreview.block({
        kind: "Table",
        editing: "widget",
        match: (node) => node.name === "Table",
        showSource: (state, block) =>
          state.field(tableSource, false) === block.from &&
          state.selection.ranges.some(
            (range) => range.from <= block.to && range.to >= block.from,
          ),
        widget: (block) => new TableWidget(block, 0, environment),
      }),
    );
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
    ctx.effect(() =>
      ctx.commands.register("editor:insert-table", () => {
        view.dispatch({
          ...view.state.replaceSelection(
            "\n\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n\n",
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
  },
};
