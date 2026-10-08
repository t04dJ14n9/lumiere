import test from "node:test";
import assert from "node:assert/strict";
import type { RenderPass } from "./api";
import { createRenderPass } from "./pass";

test("render passes dispose in reverse order and immediately clean late registrations", async () => {
  const passes = new Set<RenderPass>();
  const seen: string[] = [];
  const pass = createRenderPass({
    container: {} as RenderPass["container"],
    source: "text",
    context: { sourceLine: 4, documentUri: "note" },
    passes,
  });
  assert.equal(pass.sourceLine, 4);
  assert.equal(pass.documentUri, "note");
  assert.equal(passes.has(pass), true);
  pass.onDispose(() => {
    seen.push("first");
  });
  pass.onDispose(async () => {
    seen.push("second");
    assert.equal(passes.has(pass), false);
    pass.onDispose(() => {
      seen.push("late");
    });
    await pass.dispose();
  });
  await pass.dispose();
  await pass.dispose();
  assert.deepEqual(seen, ["second", "late", "first"]);
});
