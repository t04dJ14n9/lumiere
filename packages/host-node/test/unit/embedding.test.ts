import test from "node:test";
import assert from "node:assert/strict";
import {
  parseConnectMessage,
  parseOpenMessage,
  parseThemeMessage,
  isEmbeddingMessage,
  isPortMessage,
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

test("a channel is asked for and handed over only for the page's own panel", () => {
  assert.deepEqual(parseConnectMessage({ lumiere: "connect", panel: "p1" }), {
    lumiere: "connect",
    panel: "p1",
  });
  assert.equal(
    parseConnectMessage({ lumiere: "connect", panel: 7 }),
    undefined,
  );
  assert.equal(
    parseConnectMessage({ lumiere: "open", panel: "p1" }),
    undefined,
  );
  assert.equal(isPortMessage({ lumiere: "port", panel: "p1" }, "p1"), true);
  assert.equal(isPortMessage({ lumiere: "port", panel: "p2" }, "p1"), false);
  assert.equal(isEmbeddingMessage({ lumiere: "port", panel: "p1" }), true);
});

test("the menu message asks for the page's menu and nothing else", async () => {
  const { isMenuMessage, isShownMessage, MENU_AT_SELECTION } =
    await import("../../src/embedding");
  assert.equal(isMenuMessage(MENU_AT_SELECTION), true);
  assert.equal(isEmbeddingMessage(MENU_AT_SELECTION), true);
  assert.equal(isShownMessage(MENU_AT_SELECTION), false);
  for (const other of [
    { lumiere: "shown" },
    { lumiere: "theme" },
    "menu",
    null,
  ]) {
    assert.equal(isMenuMessage(other), false, JSON.stringify(other));
  }
});
