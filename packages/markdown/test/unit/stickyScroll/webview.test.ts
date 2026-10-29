import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../features/fixture";
import { features } from "../../../src/plugins/catalog";
import { readSettings } from "../../../src/host/settings";
import { headingIndex } from "../../../src/plugins/stickyScroll/model";
import { stickyMaxLines } from "../../../src/plugins/stickyScroll/view";

test("sticky scroll is on by default and accepts its resource setting through the existing reader", () => {
  assert.equal(
    features.find(({ id }) => id === "stickyScroll")?.defaultEnabled,
    true,
  );
  const reader = (values: Record<string, unknown>) => ({
    get: <T>(key: string, fallback?: T) => (values[key] ?? fallback) as T,
  });
  assert.equal(readSettings(reader({})).features?.stickyScroll?.enabled, true);
  const capped = readSettings(
    reader({
      "plugins.stickyScroll.enabled": true,
      "stickyScroll.maxLines": 3,
    }),
  );
  assert.deepEqual(capped.features?.stickyScroll, {
    enabled: true,
    config: { maxLines: 3 },
  });
  const disabled = readSettings(
    reader({
      "plugins.stickyScroll.enabled": false,
    }),
  );
  assert.equal(disabled.features?.stickyScroll?.enabled, false);
});

test("enable, reconfigure and disable preserve other panel state and leave no sticky state", async (t) => {
  const first = fixture();
  const second = fixture();
  t.after(() => Promise.all([first.root.dispose(), second.root.dispose()]));
  await first.configure({ stickyScroll: { enabled: true, config: {} } });
  const headings = first.view.state.field(headingIndex);
  const fiber = [...first.root.plugins].find(
    (item) => item.definition.name === "stickyScroll",
  )!;
  const context = fiber.context;
  assert.equal(fiber.state, "active");
  assert.equal(first.view.state.facet(stickyMaxLines), 5);
  assert.equal(second.view.state.field(headingIndex, false), undefined);
  await first.configure({
    stickyScroll: { enabled: true, config: { maxLines: 2 } },
  });
  assert.equal(fiber.context, context);
  assert.equal(first.view.state.field(headingIndex), headings);
  assert.equal(first.view.state.facet(stickyMaxLines), 2);
  await first.configure({});
  assert.equal(first.view.state.field(headingIndex, false), undefined);
  assert.equal(first.extensions, 0);
  await first.configure({ stickyScroll: { enabled: true, config: {} } });
  assert.equal(first.view.state.field(headingIndex).length, 1);
  assert.equal(first.view.state.facet(stickyMaxLines), 5);
});
