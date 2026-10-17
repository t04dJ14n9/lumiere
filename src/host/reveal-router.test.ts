import test from "node:test";
import assert from "node:assert/strict";
import { RevealRouter } from "./reveal-router";
import type { RevealPanel, PanelShell } from "../shared/runtime";

function panel(id: string, calls: string[]): RevealPanel {
  return {
    id,
    uri: "file:///vault/Note.md",
    active: () => true,
    reveal: async (target) => {
      calls.push(`${id}:${target.fragment}`);
      return true;
    },
  };
}
test("reveals target an exact pane and leave no mailbox for later recreation", async () => {
  const router = new RevealRouter();
  const calls: string[] = [];
  router.register(panel("left", calls));
  const stop = router.register(panel("right", calls));
  assert.equal(
    await router.deliver(router.begin(), "right", { fragment: "Heading" }),
    true,
  );
  stop();
  router.register(panel("right", calls));
  assert.deepEqual(calls, ["right:Heading"]);
});
test("cold side pane delivery waits for that pane, never same-URI warm pane", async () => {
  const router = new RevealRouter();
  const calls: string[] = [];
  router.register(panel("warm", calls));
  const delivery = router.deliver(router.begin(), "cold", {
    fragment: "Block",
  });
  router.register(panel("unrelated", calls));
  assert.deepEqual(calls, []);
  router.register(panel("cold", calls));
  assert.equal(await delivery, true);
  assert.deepEqual(calls, ["cold:Block"]);
});
test("a newer open cancels an older reveal waiting for readiness", async () => {
  const router = new RevealRouter();
  const calls: string[] = [];
  let ready!: () => void;
  const gate = new Promise<void>((resolve) => {
    ready = resolve;
  });
  router.register({
    ...panel("cold", calls),
    async reveal(target, token) {
      await gate;
      if (token.cancelled) {
        return false;
      }
      calls.push(target.fragment);
      return true;
    },
  });
  const first = router.deliver(router.begin(), "cold", { fragment: "old" });
  await Promise.resolve();
  const intent = router.begin();
  ready();
  assert.equal(await first, false);
  assert.equal(await router.deliver(intent, "cold", { fragment: "new" }), true);
  assert.deepEqual(calls, ["new"]);
});
test("cancelled openings and disposed panes never acknowledge a stale target", async () => {
  const router = new RevealRouter();
  const absent = router.deliver(router.begin(), "missing", { fragment: "old" });
  router.begin();
  assert.equal(await absent, false);
  let ack!: (ok: boolean) => void;
  const stop = router.register({
    ...panel("pane", []),
    reveal: () =>
      new Promise((resolve) => {
        ack = resolve;
      }),
  });
  const pending = router.deliver(router.begin(), "pane", {
    fragment: "heading",
  });
  await Promise.resolve();
  stop();
  ack(true);
  assert.equal(await pending, false);
});

test("native side destinations use unique panel identity, not column arithmetic", async () => {
  const { chooseRevealPanel } = await import("./reveal-router");
  const shell = (id: string, column: number, active = true) =>
    ({
      id,
      column,
      active: () => active,
      document: { uri: "file:///vault/Note.md" },
    }) as PanelShell;
  const original = shell("original", 1, false);
  const right = shell("side", 4);
  const target = { uri: original.document.uri, side: true, column: 1 };
  assert.equal(
    chooseRevealPanel([original, right], new Set(["original"]), target),
    right,
  );
  assert.equal(
    chooseRevealPanel([original, right], new Set(["original", "side"]), target),
    right,
  );
  // Unique side pane is accepted even when unfocused (Outline / sidebar focus).
  const inactiveSide = shell("side", 4, false);
  assert.equal(
    chooseRevealPanel(
      [shell("original", 1), inactiveSide],
      new Set(["original", "side"]),
      target,
    ),
    inactiveSide,
  );
  // Ambiguous same-URI pool (multiple side candidates) still refuses.
  assert.equal(
    chooseRevealPanel(
      [original, right, shell("third", 6, false)],
      new Set(["original", "side", "third"]),
      target,
    ),
    undefined,
  );
});
