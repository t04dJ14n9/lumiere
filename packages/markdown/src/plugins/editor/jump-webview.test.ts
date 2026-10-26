import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@workshop/core";
import type { EditorService } from "./api";
import { registerJumpRecorder } from "./jump-webview";
import type { createViewState } from "./view-state";

test("the jump recorder hears wheel and touch input passively", () => {
  const listened: { type: string; passive: boolean | undefined }[] = [];
  const view = {
    dom: {
      addEventListener(
        type: string,
        _listener: unknown,
        options?: AddEventListenerOptions,
      ) {
        listened.push({ type, passive: options?.passive });
      },
    },
  };
  const ctx = {
    effect(setup: () => unknown) {
      setup();
      return () => {};
    },
    rpc: { handle: () => () => {} },
  } as unknown as Context;
  const editor = {
    view,
    extend: () => () => {},
    onNavigate: () => () => {},
  } as unknown as EditorService;
  registerJumpRecorder(
    ctx,
    editor,
    {} as unknown as ReturnType<typeof createViewState>,
  );
  for (const type of ["wheel", "touchstart"]) {
    const found = listened.find((entry) => entry.type === type);
    assert.ok(found, `listens to ${type}`);
    assert.equal(found.passive, true, `${type} must not block scrolling`);
  }
});
