import test from "node:test";
import assert from "node:assert/strict";
import { features, workbenchFeatures } from "../../../src/plugins/catalog";
import {
  CORE_ORDER,
  FEATURE_ORDER,
  WORKBENCH_FEATURE_ORDER,
  inPluginOrder,
  pluginRank,
} from "../../../src/plugins/plugin-order";

test("every catalog plugin has exactly one place in the plugin order", () => {
  const all = [...CORE_ORDER, ...FEATURE_ORDER, ...WORKBENCH_FEATURE_ORDER];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(
    features.map((item) => item.id),
    [...FEATURE_ORDER],
  );
  assert.deepEqual(
    workbenchFeatures.map((item) => item.id),
    [...WORKBENCH_FEATURE_ORDER],
  );
});

test("rank follows the order, core first; unknown owners come last", () => {
  assert.ok(pluginRank("document") < pluginRank("tables"));
  assert.ok(pluginRank("tables") < pluginRank("vim"));
  assert.ok(pluginRank("vim") < pluginRank("backlinks"));
  assert.equal(pluginRank("external.plugin"), pluginRank("other.plugin"));
  assert.ok(pluginRank("external.plugin") > pluginRank("linkUpdates"));
});

test("a plugin missing from the order is an error, not a silent last place", () => {
  assert.throws(
    () => inPluginOrder([{ id: "tables" }, { id: "unlisted" }], FEATURE_ORDER),
    /unlisted has no place/,
  );
});
