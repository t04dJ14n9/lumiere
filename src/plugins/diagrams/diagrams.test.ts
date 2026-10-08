import test from "node:test";
import assert from "node:assert/strict";
import { diagramLanguage } from "./webview";
test("diagrams claim only the Mermaid fence language", () => {
  assert.equal(diagramLanguage(" mermaid title"), true);
  assert.equal(diagramLanguage("MERMAID"), true);
  assert.equal(diagramLanguage("mermaid-extra"), false);
  assert.equal(diagramLanguage("javascript"), false);
});
