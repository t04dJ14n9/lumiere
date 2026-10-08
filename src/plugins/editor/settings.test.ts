import test from "node:test";
import assert from "node:assert/strict";
import { Compartment, EditorState, StateField } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { config } from "./manifest";
import { settingsExtensions } from "./settings";

test("editor indentation settings reconfigure without replacing document, selection or unrelated state", () => {
  const settings = new Compartment();
  const field = StateField.define({
    create: () => ({}),
    update: (value) => value,
  });
  let state = EditorState.create({
    doc: "text",
    selection: { anchor: 2 },
    extensions: [field, settings.of(settingsExtensions(config.parse({})))],
  });
  const original = state;
  assert.equal(state.facet(indentUnit), "\t");
  assert.equal(state.tabSize, 4);
  for (const options of [
    { useTabs: false, tabSize: 2 },
    { useTabs: true, tabSize: 8 },
  ]) {
    state = state.update({
      effects: settings.reconfigure(settingsExtensions(config.parse(options))),
    }).state;
    assert.equal(state.facet(indentUnit), options.useTabs ? "\t" : "  ");
    assert.equal(state.tabSize, options.tabSize);
    assert.equal(state.doc, original.doc);
    assert.equal(state.selection, original.selection);
    assert.equal(state.field(field), original.field(field));
  }
  for (const tabSize of [0, 17, 1.5, NaN, "4"])
    assert.throws(() => config.parse({ tabSize }));
});
