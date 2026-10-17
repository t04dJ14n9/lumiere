import assert from "node:assert/strict";
import { test } from "node:test";
import {
  stopEngine,
  type StoppableEngine,
} from "../../src/webview/engine-destruction";

/** A fake EmbedPDF engine: `close` decides what closeAllDocuments' task does. */
function engine(
  close: "never" | "ok" | "error",
  destroy: () => unknown = () => undefined,
) {
  const calls: string[] = [];
  let finishClose: (() => void) | undefined;
  const fake: StoppableEngine = {
    closeAllDocuments: () => ({
      wait(onResult, onError) {
        calls.push("close");
        if (close === "ok") {
          onResult();
        }
        if (close === "error") {
          onError(new Error("close failed"));
        }
        if (close === "never") {
          finishClose = onResult;
        }
      },
    }),
    destroy: () => {
      calls.push("destroy");
      return destroy();
    },
  };
  return { fake, calls, finishClose: () => finishClose?.() };
}

test("an engine whose documents close is destroyed at once", async () => {
  const { fake, calls } = engine("ok");
  await stopEngine(fake, 10_000);
  assert.deepEqual(calls, ["close", "destroy"]);
});

test("an engine whose close fails is still destroyed", async () => {
  const { fake, calls } = engine("error");
  await stopEngine(fake, 10_000);
  assert.deepEqual(calls, ["close", "destroy"]);
});

test("an engine whose close never settles is destroyed at the deadline, and only once", async () => {
  const { fake, calls, finishClose } = engine("never");
  const started = Date.now();
  await stopEngine(fake, 30);
  assert.ok(Date.now() - started >= 25);
  assert.deepEqual(calls, ["close", "destroy"]);
  finishClose();
  assert.deepEqual(calls, ["close", "destroy"]);
});

test("a destroy that throws, or whose task fails, rejects", async () => {
  await assert.rejects(
    stopEngine(
      engine("ok", () => {
        throw new Error("boom");
      }).fake,
      10_000,
    ),
    /boom/,
  );
  const failedTask = {
    wait: (_ok: () => void, onError: (error: unknown) => void) =>
      onError({ code: 1, message: "terminate failed" }),
  };
  await assert.rejects(
    stopEngine(engine("ok", () => failedTask).fake, 10_000),
    /could not stop: terminate failed/,
  );
});
