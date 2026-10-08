import type { Context } from "../../kernel";
import { frontmatter } from "../../markdown/properties";
import type { RenderPass } from "../render/api";
import type { EditorService } from "../editor/api";
import { taskEdit } from "./edits";
import { protocol } from "./protocol";

interface TaskControls {
  pass: RenderPass;
  cleanups: Set<() => void>;
  editor: EditorService;
  rpc: Context["rpc"];
  logger: Context["logger"];
}

export function bindRenderedTasks(options: TaskControls): void {
  const { pass, cleanups } = options;
  const events = new AbortController();
  const controls = [
    ...pass.container.querySelectorAll<HTMLInputElement>("input[data-task]"),
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
          toggleEmbeddedTask(
            { box, line, expected, source: pass.documentUri },
            options,
          );
        } else {
          toggleLocalTask({ box, line, expected }, options.editor);
        }
      },
      { signal: events.signal },
    );
  }
}

interface TaskToggle {
  box: HTMLInputElement;
  line: number;
  expected: string;
}

function toggleEmbeddedTask(
  { box, line, expected, source }: TaskToggle & { source: string },
  { rpc, logger }: Pick<TaskControls, "rpc" | "logger">,
): void {
  void rpc
    .call(protocol, "toggle", { source, line, expected, checked: box.checked })
    .then((ok) => {
      if (!ok) {
        box.checked = !box.checked;
      }
    })
    .catch((error) => {
      box.checked = !box.checked;
      logger.warn("Task edit failed", error);
    });
}

function toggleLocalTask(
  { box, line, expected }: TaskToggle,
  editor: EditorService,
): void {
  const change = taskEdit(
    editor.view.state.doc.toString(),
    line,
    expected,
    box.checked,
  );
  if (change) {
    editor.view.dispatch({ changes: change, userEvent: "input.task" });
  } else {
    box.checked = !box.checked;
  }
}
