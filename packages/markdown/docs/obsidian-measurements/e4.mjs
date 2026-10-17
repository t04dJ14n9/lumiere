import { session } from "./pk.mjs";
const s = await session(
  "---\ntitle: Hello\nnum: abc\nflag: yes\nlist:\n  - a\n  - b\n---\nbody\n",
);
const { page } = s;
const R = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
const FM = async (l = "") =>
  console.log("  fm:", JSON.stringify(await s.fm()), l);
console.log("rows", await s.rows());
console.log(
  "warnings:",
  await page.evaluate(() =>
    [...document.querySelectorAll(".metadata-property")].map(
      (r) =>
        r.dataset.propertyKey +
        ":" +
        getComputedStyle(r.querySelector(".metadata-property-warning-icon"))
          .display,
    ),
  ),
);
// Add property via command
const cmds = await page.evaluate(() =>
  Object.keys(app.commands.commands)
    .filter((c) => /propert|metadata/i.test(c))
    .map(
      (c) =>
        c +
        " = " +
        app.commands.commands[c].name +
        " " +
        JSON.stringify(
          (app.commands.commands[c].hotkeys || []).map(
            (h) => h.modifiers.join("+") + "+" + h.key,
          ),
        ),
    ),
);
console.log(cmds.join("\n"));
await page.click(".workspace-leaf.mod-active .cm-content");
await page.evaluate(() =>
  app.commands.executeCommandById("editor:add-metadata-property"),
);
await page.waitForTimeout(500);
await s.log("after Add property");
console.log("rows", await s.rows());
console.log(
  "suggest popup:",
  await page.evaluate(() =>
    [...document.querySelectorAll(".suggestion-container .suggestion-item")]
      .map((e) => e.textContent)
      .slice(0, 12),
  ),
);
await s.type("st");
console.log(
  "suggest after 'st':",
  await page.evaluate(() =>
    [...document.querySelectorAll(".suggestion-container .suggestion-item")]
      .map((e) => e.textContent)
      .slice(0, 12),
  ),
);
await s.key("Enter", "Enter (pick/accept key)");
console.log("rows", await s.rows());
await FM();
await s.type("done");
await s.key("Enter", "Enter in value");
await FM();
// new second property with a duplicate key
await page.evaluate(() =>
  app.commands.executeCommandById("editor:add-metadata-property"),
);
await page.waitForTimeout(400);
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
// rename
await page.click(R("list") + " .metadata-property-key-input");
await page.keyboard.press("Control+a");
await s.type("items");
await s.key("Enter", "rename Enter");
console.log("rows", await s.rows());
await FM();
await page.click(R("items") + " .metadata-property-key-input");
await page.keyboard.press("Control+a");
await s.type("title");
await s.key("Tab", "rename to existing + Tab");
console.log("rows", await s.rows());
await FM();
await page.click(R("items") + " .metadata-property-key-input");
await page.keyboard.press("Control+a");
await page.keyboard.press("Backspace");
await s.key("Tab", "rename to empty + Tab");
console.log("rows", await s.rows());
await FM();
await s.browser.close();
