import type { Plugin } from "../../kernel";
import { frontmatter } from "../../markdown/properties";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import { TaskBox } from "./widget";
import { taskEdit, checklistEdit } from "./edits";
import { protocol } from "./protocol";
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
    ctx.effect(() =>
      ctx.livePreview.inline({
        nodes: ["TaskMarker"],
        decorate(node, cx) {
          if (!cx.revealed(node.from, node.to)) {
            cx.replace(
              node.from,
              node.to,
              new TaskBox(
                cx.state.doc.lineAt(node.from).text,
                cx.state.sliceDoc(node.from + 1, node.from + 2) !== " ",
              ),
            );
          }
        },
      }),
    );
    ctx.on("render/postProcess", (pass) => {
      const events = new AbortController();
      const controls = [
        ...pass.container.querySelectorAll<HTMLInputElement>(
          "input[data-task]",
        ),
      ];
      const cleanup = () => {
        events.abort();
        for (const box of controls) {
          box.disabled = true;
        }
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      pass.onDispose(cleanup);
      const removed =
        pass.source.slice(0, frontmatter(pass.source)?.end ?? 0).split("\n")
          .length - 1;
      const lines = pass.source.split("\n");
      for (const box of controls) {
        const local = Number(box.dataset.line) + removed;
        const expected = lines[local];
        box.disabled =
          pass.ancestry.includes("footnote-preview") ||
          expected === undefined ||
          (pass.taskLineCount !== undefined && local >= pass.taskLineCount);
        box.addEventListener(
          "click",
          () => {
            if (box.disabled || expected === undefined) {
              return;
            }
            const line = pass.sourceLine + local;
            if (pass.documentUri) {
              void ctx.rpc
                .call(protocol, "toggle", {
                  source: pass.documentUri,
                  line,
                  expected,
                  checked: box.checked,
                })
                .then((ok) => {
                  if (!ok) {
                    box.checked = !box.checked;
                  }
                })
                .catch((error) => {
                  box.checked = !box.checked;
                  ctx.logger.warn("Task edit failed", error);
                });
            } else {
              const change = taskEdit(
                ctx.editor.view.state.doc.toString(),
                line,
                expected,
                box.checked,
              );
              if (change) {
                ctx.editor.view.dispatch({
                  changes: change,
                  userEvent: "input.task",
                });
              } else {
                box.checked = !box.checked;
              }
            }
          },
          { signal: events.signal },
        );
      }
    });
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
  },
};
