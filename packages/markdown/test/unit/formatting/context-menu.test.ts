import test from "node:test";
import assert from "node:assert/strict";
import { contributions } from "../../../scripts/contributions";

test("coloured highlight toggles appear on the markdown content context menu", async () => {
  const generated = await contributions();
  const actions = generated.menus["webview/context"] ?? [];
  const colours = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple"];
  for (const colour of colours) {
    const item = actions.find(
      (action) =>
        action.command === `lumiere.markdown.toggleHighlight${colour}`,
    );
    assert.ok(item, colour);
    assert.ok(item.when.includes("webviewSection == 'markdownContent'"));
    assert.ok(item.group?.startsWith("formattingColour@"));
  }
  const plain = actions.find(
    (action) => action.command === "lumiere.markdown.toggleHighlight",
  );
  assert.ok(plain);
  assert.equal(plain.group, "formatting@1");
});

test("webview/context gates on webviewId (not activeCustomEditorId)", async () => {
  const generated = await contributions();
  const actions = generated.menus["webview/context"] ?? [];
  const copyLink = actions.find(
    (action) => action.command === "lumiere.markdown.copyLinkForAgent",
  );
  assert.ok(copyLink, "Copy Link for Agent on webview/context");
  assert.match(copyLink.when, /webviewId == 'lumiere\.markdown\.editor'/);
  assert.ok(!copyLink.when.includes("activeCustomEditorId"));
  assert.ok(copyLink.when.includes("lumiere.markdown.hasSelection"));
  assert.equal(copyLink.group, "0_agent@1");
  const bold = actions.find(
    (action) => action.command === "lumiere.markdown.toggleBold",
  );
  assert.ok(bold);
  assert.match(bold.when, /webviewId == 'lumiere\.markdown\.editor'/);
  assert.ok(!bold.when.includes("activeCustomEditorId"));
});
