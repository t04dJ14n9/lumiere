import assert from "node:assert/strict";
import test from "node:test";
import { bindRenderedTasks } from "../../../src/plugins/tasks/post-process";
import type { RenderPass } from "../../../src/plugins/render/api";
import type { Context } from "@workshop/core";

test("generated read-only task controls cannot edit their source note", () => {
  let click = () => {};
  let dispose = () => {};
  const box = {
    dataset: { line: "0" },
    disabled: false,
    checked: true,
    addEventListener(_event: string, run: () => void) {
      click = run;
    },
  };
  const pass = {
    readOnly: true,
    source: "- [ ] generated",
    sourceLine: 0,
    ancestry: [],
    documentUri: "file:///note.md",
    container: { querySelectorAll: () => [box] },
    onDispose(run: () => void) {
      dispose = run;
    },
  } as unknown as RenderPass;
  const cleanups = new Set<() => void>();
  bindRenderedTasks({
    pass,
    cleanups,
    editor: {} as Context["editor"],
    rpc: {
      call() {
        assert.fail("generated task attempted a document edit");
      },
    } as unknown as Context["rpc"],
    logger: { debug() {}, warn() {}, error() {} },
  });
  assert.equal(box.disabled, true);
  click();
  dispose();
  assert.equal(cleanups.size, 0);
});
