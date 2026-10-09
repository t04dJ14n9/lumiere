import test from "node:test";
import assert from "node:assert/strict";
import { keymap } from "@codemirror/view";
import { fixture } from "./fixture";

test("bold, italics and link keys stop in the editor so VS Code does not run them again", async () => {
  const f = fixture();
  await f.configure({ formatting: { enabled: true, config: {} } });
  const bindings = f.view.state.facet(keymap).flat();
  for (const key of ["Mod-b", "Mod-i", "Mod-k"]) {
    const binding = bindings.find((item) => item.key === key);
    assert.ok(binding, key);
    // VS Code forwards keystrokes that reach the webview window to its
    // keybinding service: Ctrl+B would bold, then unbold.
    assert.equal(binding.stopPropagation, true, key);
  }
});
