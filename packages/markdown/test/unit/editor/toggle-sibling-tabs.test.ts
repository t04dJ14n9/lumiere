import assert from "node:assert/strict";
import test from "node:test";
import { isToggleLeaveBehind } from "../../../src/host/toggle-sibling-tabs";

const uri = "file:///Math.md";

test("keep text: closes a clean Lumière tab for the same URI", () => {
  assert.equal(
    isToggleLeaveBehind({ uri, kind: "lumiere", isDirty: false }, uri, "text"),
    true,
  );
});

test("keep text: leaves the text tab and other URIs alone", () => {
  assert.equal(
    isToggleLeaveBehind({ uri, kind: "text", isDirty: false }, uri, "text"),
    false,
  );
  assert.equal(
    isToggleLeaveBehind(
      { uri: "file:///Other.md", kind: "lumiere", isDirty: false },
      uri,
      "text",
    ),
    false,
  );
});

test("keep lumiere: closes a clean text tab for the same URI", () => {
  assert.equal(
    isToggleLeaveBehind({ uri, kind: "text", isDirty: false }, uri, "lumiere"),
    true,
  );
});

test("keep lumiere: leaves Lumière and dirty text tabs alone", () => {
  assert.equal(
    isToggleLeaveBehind(
      { uri, kind: "lumiere", isDirty: false },
      uri,
      "lumiere",
    ),
    false,
  );
  assert.equal(
    isToggleLeaveBehind({ uri, kind: "text", isDirty: true }, uri, "lumiere"),
    false,
  );
});

test("dirty Lumière leave-behind is kept when switching to text", () => {
  assert.equal(
    isToggleLeaveBehind({ uri, kind: "lumiere", isDirty: true }, uri, "text"),
    false,
  );
});
