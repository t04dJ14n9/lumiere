import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import { inlineRenderers } from "../../../src/plugins/livePreview/registry";
import { createRenderer } from "../../../src/markdown/html";
import { TaskBox } from "../../../src/plugins/tasks/widget";
import { inlineTasks } from "../../../src/plugins/tasks/webview";

const source = [
  "- [ ] open",
  "- [x] done",
  "- [/] in progress",
  "- [-] cancelled",
  "",
  "after",
].join("\n");

function taskLines(anchor: number) {
  const state = EditorState.create({
    doc: source,
    selection: { anchor },
    extensions: [documentTree, inlineRenderers.of(inlineTasks)],
  });
  const lines: { line: number; cls: string; task: string }[] = [];
  const boxes: { status: string; checked: boolean }[] = [];
  const struck: string[] = [];
  inlineDecorations(state, [{ from: 0, to: source.length }]).between(
    0,
    source.length,
    (from, to, value) => {
      if (String(value.spec.class).startsWith("md-task-line")) {
        lines.push({
          line: state.doc.lineAt(from).number,
          cls: value.spec.class,
          task: value.spec.attributes["data-task"],
        });
      }
      if (value.spec.class === "md-task-done") {
        struck.push(state.sliceDoc(from, to));
      }
      if (value.spec.widget instanceof TaskBox) {
        boxes.push(value.spec.widget);
      }
    },
  );
  return { lines, boxes, struck };
}

test("every checked status mutes and strikes its Live Preview line, like [x]", () => {
  const { lines, boxes, struck } = taskLines(source.length);
  assert.deepEqual(struck, ["done", "in progress", "cancelled"]);
  assert.deepEqual(lines, [
    { line: 1, cls: "md-task-line", task: " " },
    { line: 2, cls: "md-task-line is-checked", task: "x" },
    { line: 3, cls: "md-task-line is-checked", task: "/" },
    { line: 4, cls: "md-task-line is-checked", task: "-" },
  ]);
  assert.deepEqual(
    boxes.map((box) => [box.status, box.checked]),
    [
      [" ", false],
      ["x", true],
      ["/", true],
      ["-", true],
    ],
  );
});

test("the line keeps its checked style while the caret shows the marker", () => {
  const { lines, boxes } = taskLines(source.indexOf("[x]") + 1);
  assert.equal(lines.length, 4);
  assert.equal(boxes.length, 3);
});

test("rendered tasks carry their status for themes and snippets", () => {
  const html = createRenderer().renderMarkdown(
    "- [/] half\n- [x] done\n- [ ] open",
    {
      sanitize: (html) => html,
    },
  );
  assert.match(
    html,
    /<li class="task-list-item" data-task="\/"><input type="checkbox" data-task="\/"[^>]* checked>/,
  );
  assert.match(
    html,
    /<li class="task-list-item" data-task="x"><input type="checkbox" data-task="x"[^>]* checked>/,
  );
  assert.match(
    html,
    /<li class="task-list-item" data-task=" "><input type="checkbox" data-task=" "[^>]*aria-label="Task">/,
  );
});
