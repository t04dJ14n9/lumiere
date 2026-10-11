import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { FindNavigation, findNavigationStep } from "./find-navigation";
import { FindPanel } from "./find-panel";
import { findKeymap } from "./find";
import { observeNavigation } from "./navigation";

function harness() {
  const view = {} as EditorView;
  let position = 10;
  const jumps: number[][] = [];
  observeNavigation(view, () => {
    const from = position;
    return () => jumps.push([from, position]);
  });
  return {
    view,
    navigation: new FindNavigation(view),
    jumps,
    move(next: number) {
      position = next;
    },
  };
}

test("accepting an already previewed search result retains the pre-query origin", () => {
  const h = harness();
  h.navigation.preview(() => h.move(30));
  h.navigation.preview(() => h.move(50));
  assert.deepEqual(h.jumps, []);
  h.navigation.accept(() => true);
  assert.deepEqual(h.jumps, [[10, 50]]);
  h.navigation.accept(() => {
    h.move(70);
    return true;
  });
  assert.deepEqual(h.jumps, [
    [10, 50],
    [50, 70],
  ]);
});

test("production next/previous shortcuts accept the retained search origin", (t) => {
  for (const key of ["Mod-g", "F3"]) {
    for (const reverse of [false, true]) {
      const h = harness();
      h.navigation.preview(() => h.move(30));
      const panel = {
        next: (back: boolean) => {
          assert.equal(back, reverse);
          return h.navigation.accept(() => true);
        },
      } as FindPanel;
      const mocked = t.mock.method(FindPanel, "of", () => panel);
      const binding = findKeymap.find((item) => item.key === key)!;
      assert.equal((reverse ? binding.shift! : binding.run!)(h.view), true);
      assert.deepEqual(h.jumps, [[10, 30]]);
      mocked.mock.restore();
    }
  }
});

test("search acceptance keys are distinguishable from reader input", () => {
  const event = {
    key: "g",
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  };
  assert.equal(findNavigationStep(event), "next");
  assert.equal(findNavigationStep({ ...event, shiftKey: true }), "previous");
  assert.equal(
    findNavigationStep({ ...event, key: "F3", metaKey: false }),
    "next",
  );
  assert.equal(findNavigationStep({ ...event, key: "ArrowDown" }), undefined);
  assert.equal(findNavigationStep({ ...event, altKey: true }), undefined);
});

test("reader movement, editing or closing the panel retires a preview origin", () => {
  const h = harness();
  h.navigation.preview(() => h.move(30));
  h.navigation.cancel();
  h.move(40);
  h.navigation.preview(() => h.move(50));
  h.navigation.accept(() => true);
  assert.deepEqual(h.jumps, [[40, 50]]);
});

test("failed search acceptance does not record and preview ownership unwinds on errors", () => {
  const h = harness();
  h.navigation.preview(() => h.move(30));
  assert.equal(
    h.navigation.accept(() => false),
    false,
  );
  assert.deepEqual(h.jumps, []);
  assert.throws(() =>
    h.navigation.preview(() => {
      throw new Error("preview");
    }),
  );
  assert.equal(h.navigation.running, false);
  h.navigation.cancel();
  assert.throws(() =>
    h.navigation.accept(() => {
      throw new Error("accept");
    }),
  );
  assert.equal(h.navigation.running, false);
});
