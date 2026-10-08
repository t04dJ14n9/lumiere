import test from "node:test";
import assert from "node:assert/strict";
import { Compartment, EditorState, Facet, StateField } from "@codemirror/state";
import { ExtensionRegistry } from "./extensions";

test("extension slots, rank and per-owner order survive removal and re-registration", async () => {
  const compartment = new Compartment();
  const values = Facet.define<string>();
  const retained = StateField.define({
    create: () => ({}),
    update: (value) => value,
  });
  let state = EditorState.create({ extensions: compartment.of([]) });
  const registry = new ExtensionRegistry(
    (owner) => (owner === "a" ? 0 : 1),
    (extensions) => {
      state = state.update({
        effects: compartment.reconfigure(extensions),
      }).state;
    },
  );
  registry.register("b", [values.of("b"), retained]);
  const identity = state.field(retained);
  let stop = registry.register("a", values.of("a"));
  registry.register("b", values.of("override"), "override");
  assert.deepEqual(state.facet(values), ["override", "a", "b"]);
  assert.deepEqual(
    registry.ordered().map((entry) => entry.owner),
    ["b", "a", "b"],
  );
  await stop();
  stop = registry.register("a", values.of("a"));
  assert.deepEqual(state.facet(values), ["override", "a", "b"]);
  assert.equal(state.field(retained), identity);
  const second = registry.register("a", values.of("a2"));
  assert.deepEqual(state.facet(values), ["override", "a", "a2", "b"]);
  await second();
  await stop();
  assert.equal(state.field(retained), identity);
});
