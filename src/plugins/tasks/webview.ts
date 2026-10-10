import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type { InlineRenderer } from "../livePreview/api";
import type {} from "../render/api";
import { TaskBox } from "./widget";
import { checklistEdit } from "./edits";
import { taskLine } from "./status";
import { bindRenderedTasks } from "./post-process";
export const tasksWebview: Plugin = {
  name: "tasks",
  inject: { required: ["editor", "commands", "livePreview", "rpc"] },
  apply(ctx) {
    const cleanups = new Set<() => void>();
    ctx.effect(() => () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    });
    registerInlineTasks(ctx);
    ctx.on("render/postProcess", (pass) => {
      bindRenderedTasks({
        pass,
        cleanups,
        editor: ctx.editor,
        rpc: ctx.rpc,
        logger: ctx.logger,
      });
    });
    registerChecklistCommands(ctx);
  },
};

/** Task checkboxes in Live Preview, and the checked style of their lines. */
export const inlineTasks: InlineRenderer = {
  nodes: ["TaskMarker"],
  decorate(node, cx) {
    const status = cx.state.sliceDoc(node.from + 1, node.from + 2);
    const line = taskLine(status);
    cx.line(node.from, line.cls, line.attributes);
    if (status !== " ") {
      // Strike the task's text, not its indentation or checkbox.
      const text = cx.state.doc.lineAt(node.from);
      cx.mark(Math.min(node.to + 1, text.to), text.to, "md-task-done");
    }
    const marker = node.node.parent?.parent?.getChild("ListMark");
    if (!cx.revealed(marker?.from ?? node.from, node.to)) {
      cx.replace(
        node.from,
        node.to,
        new TaskBox(
          cx.state.doc.lineAt(node.from).text,
          status !== " ",
          status,
        ),
      );
    }
  },
};

function registerInlineTasks(ctx: Context): void {
  ctx.effect(() => ctx.livePreview.inline(inlineTasks));
}

function registerChecklistCommands(ctx: Context): void {
  for (const [id, cycle] of [
    ["editor:toggle-checklist-status", false],
    ["editor:cycle-list-checklist", true],
  ] as const) {
    ctx.effect(() =>
      ctx.commands.register(id, () => {
        ctx.editor.view.dispatch(checklistEdit(ctx.editor.view.state, cycle));
        return true;
      }),
    );
  }
}
