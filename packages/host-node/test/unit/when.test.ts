import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWhen } from "../../src/host/when";

const keys: Record<string, unknown> = {
  activeCustomEditorId: "lumiere.markdown.editor",
  webviewSection: "markdownContent",
  "lumiere.markdown.hasSelection": true,
  "lumiere.markdown.plugin.agentBridge": true,
  "lumiere.markdown.plugin.formatting": false,
  count: 2,
};
const lookup = (key: string) => keys[key];
const when = (expression: string | undefined) =>
  evaluateWhen(expression, lookup);

test("Copy Link for Agent's own clause, as package.json writes it", () => {
  assert.equal(
    when(
      "activeCustomEditorId == 'lumiere.markdown.editor' && lumiere.markdown.plugin.agentBridge && webviewSection == 'markdownContent' && lumiere.markdown.hasSelection",
    ),
    true,
  );
  assert.equal(
    when(
      "activeCustomEditorId == 'lumiere.pdf.viewer' && lumiere.markdown.hasSelection",
    ),
    false,
  );
});

test("keys alone, !, ||, != and parentheses", () => {
  assert.equal(when("lumiere.markdown.plugin.formatting"), false);
  assert.equal(when("!lumiere.markdown.plugin.formatting"), true);
  assert.equal(when("missing || lumiere.markdown.hasSelection"), true);
  assert.equal(when("webviewSection != 'markdownContent'"), false);
  assert.equal(
    when("!(missing || lumiere.markdown.plugin.formatting) && count == 2"),
    true,
  );
  assert.equal(when('webviewSection == "markdownContent"'), true);
  assert.equal(when("true && !false"), true);
  assert.equal(when(""), true);
  assert.equal(when(undefined), true);
});

test("a clause it does not understand is false, never true by accident", () => {
  assert.equal(when("resourceExtname =~ /\\.md$/"), false);
  assert.equal(when("count > 1"), false);
  assert.equal(when("webviewSection == "), false);
  assert.equal(when("(lumiere.markdown.hasSelection"), false);
  assert.equal(when("lumiere.markdown.hasSelection )"), false);
  assert.equal(when("'unterminated"), false);
  assert.equal(when("!(count > 1)"), false);
});
