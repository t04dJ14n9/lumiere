import test from "node:test";
import assert from "node:assert/strict";
import {
  inputText,
  isNativeInput,
  setInputText,
} from "../../../src/plugins/properties/value-input";

test("textarea values are read and written through .value, not textContent", () => {
  const area = {
    tagName: "TEXTAREA",
    value: "",
    textContent: "stale markup",
  } as unknown as HTMLTextAreaElement;
  assert.equal(isNativeInput(area), true);
  setInputText(area, "by: agent\nat: now");
  assert.equal(area.value, "by: agent\nat: now");
  area.value = "by: edited\nat: now";
  assert.equal(inputText(area), "by: edited\nat: now");
  assert.equal(area.textContent, "stale markup");
});
