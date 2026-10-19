import { session } from "./pk.mjs";
const s = await session("---\ntitle: Hello\nnum: 3\n---\nbody\n");
const { page } = s;
const R = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
const FM = async (l = "") =>
  console.log("  fm:", JSON.stringify(await s.fm()), l);
const sug = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".suggestion-container .suggestion-item")]
      .map((e) => e.textContent)
      .slice(0, 10),
  );
await page.click(".workspace-leaf.mod-active .cm-content");
await page.keyboard.press("Control+;");
await page.waitForTimeout(600);
await s.log("after Ctrl+;");
console.log("rows", await s.rows(), "suggest:", await sug());
await s.type("st");
console.log("suggest 'st':", await sug());
await s.key("Enter", "Enter after 'st'");
console.log("rows", await s.rows());
await FM();
console.log(
  "value type:",
  await page.evaluate(
    () =>
      document.activeElement.closest(".metadata-property-value")?.dataset
        .propertyType,
  ),
);
await s.type("done");
await s.key("Enter", "Enter in value");
await FM();
console.log("rows", await s.rows());
// Add again: Esc with empty key
await page.click(".workspace-leaf.mod-active .cm-content");
await page.keyboard.press("Control+;");
await page.waitForTimeout(500);
await s.key("Escape", "Esc on empty new row");
console.log("rows", await s.rows());
await FM();
await page.click(".workspace-leaf.mod-active .cm-content");
await page.keyboard.press("Control+;");
await page.waitForTimeout(500);
await s.type("title");
await s.key("Enter", "dup key Enter");
console.log("rows", await s.rows());
await FM();
console.log(
  "notice:",
  await page.evaluate(() =>
    [...document.querySelectorAll(".notice")].map((n) => n.textContent),
  ),
);
await page.click(".workspace-leaf.mod-active .cm-content");
await page.keyboard.press("Control+;");
await page.waitForTimeout(500);
await s.type("tags");
await s.key("Enter", "key 'tags'");
console.log("rows", await s.rows());
await FM();
await page.click(".workspace-leaf.mod-active .cm-content");
await page.keyboard.press("Control+;");
await page.waitForTimeout(500);
await s.type("my key");
await s.key("Enter", "key with space");
await s.type("v");
await s.key("Enter");
await FM();
// collapse
const heading = ".workspace-leaf.mod-active .metadata-properties-heading";
await page.click(heading);
await page.waitForTimeout(300);
console.log(
  "collapsed class:",
  await page.evaluate(
    () =>
      document.querySelector(".workspace-leaf.mod-active .metadata-container")
        .className,
  ),
  await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector(".workspace-leaf.mod-active .metadata-content"),
      ).display,
  ),
);
await s.log("focus after collapse");
await page.reload;
await page.evaluate(async () => {
  const f = app.vault.getAbstractFileByPath("Welcome.md");
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise((r) => setTimeout(r, 500));
  const g = app.vault.getAbstractFileByPath("pk.md");
  await app.workspace.getLeaf(false).openFile(g);
  await new Promise((r) => setTimeout(r, 700));
});
console.log(
  "after reopen collapsed?",
  await page.evaluate(
    () =>
      document.querySelector(".workspace-leaf.mod-active .metadata-container")
        .className,
  ),
);
await page.keyboard.press("Tab");
await s.log("Tab onto heading");
await s.key("Enter", "Enter on heading");
console.log(
  await page.evaluate(
    () =>
      document.querySelector(".workspace-leaf.mod-active .metadata-container")
        .className,
  ),
);
await s.key("Space", "Space on heading");
console.log(
  await page.evaluate(
    () =>
      document.querySelector(".workspace-leaf.mod-active .metadata-container")
        .className,
  ),
);
await s.browser.close();
