import test from "node:test";
import assert from "node:assert/strict";
import {
  isEmbeddingMessage,
  parseOpenMessage,
  parseThemeMessage,
} from "../../src/embedding";

test("a theme message keeps only theme variables with harmless values", () => {
  assert.deepEqual(
    parseThemeMessage({
      lumiere: "theme",
      dark: true,
      variables: {
        "--vscode-editor-background": "#151517",
        "--vscode-font-family": '"SF Pro", system-ui',
        "--other": "red",
        "--vscode-x": "red; background: url(x)",
        "--vscode-y": 3,
      },
    }),
    {
      lumiere: "theme",
      dark: true,
      variables: {
        "--vscode-editor-background": "#151517",
        "--vscode-font-family": '"SF Pro", system-ui',
      },
    },
  );
  for (const bad of [
    null,
    "theme",
    { lumiere: "theme", dark: "yes", variables: {} },
    { lumiere: "theme", dark: true },
    { lumiere: "open", dark: true, variables: {} },
  ]) {
    assert.equal(parseThemeMessage(bad), undefined, JSON.stringify(bad));
  }
});

test("an open request names a path and a fragment", () => {
  assert.deepEqual(
    parseOpenMessage({ lumiere: "open", path: "/v/a.md", fragment: "#H" }),
    { lumiere: "open", path: "/v/a.md", fragment: "#H" },
  );
  assert.equal(
    parseOpenMessage({ lumiere: "open", path: "/v/a.md" }),
    undefined,
  );
  assert.equal(
    parseOpenMessage({ type: "lumiere:open", path: "/v" }),
    undefined,
  );
});

test("embedding messages are told apart from the editor's RPC envelopes", () => {
  assert.equal(isEmbeddingMessage({ lumiere: "theme" }), true);
  assert.equal(isEmbeddingMessage({ id: 1, method: "x" }), false);
  assert.equal(isEmbeddingMessage("text"), false);
});

test("the shown message is told apart from the others", async () => {
  const { isShownMessage, SHOWN } = await import("../../src/embedding");
  assert.equal(isShownMessage(SHOWN), true);
  assert.equal(isShownMessage({ lumiere: "shown" }), true);
  assert.equal(isEmbeddingMessage(SHOWN), true);
  for (const other of [
    { lumiere: "theme" },
    { lumiere: "open" },
    "shown",
    null,
  ]) {
    assert.equal(isShownMessage(other), false, JSON.stringify(other));
  }
});
