import { connect } from "./lib.mjs";
const { browser, page } = await connect();
const text =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";
await page.evaluate(async (t) => {
  let f = app.vault.getAbstractFileByPath("tb.md");
  await app.vault.modify(f, t);
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise((r) => setTimeout(r, 800));
}, text);
const W = ".workspace-leaf.mod-active .cm-table-widget";
const items = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".menu")].map((mn) =>
      [...mn.querySelectorAll(".menu-item")]
        .map(
          (m) =>
            (m.className.includes("is-disabled") ? "(dis) " : "") +
            m.querySelector(".menu-item-title")?.textContent +
            (m.querySelector(".menu-item-hotkey")
              ? " {" + m.querySelector(".menu-item-hotkey").textContent + "}"
              : "") +
            (m.querySelector(".menu-item-submenu-indicator, .has-submenu")
              ? " >"
              : ""),
        )
        .join(" | "),
    ),
  );
const show = async (l) => {
  await page.waitForTimeout(400);
  console.log(l.padEnd(28), JSON.stringify(await items()));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
};
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)");
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)", {
  button: "right",
});
await show("right-click cell");
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)");
await page.click(W + " thead th:nth-child(2) .table-col-drag-handle");
await show("click col handle");
await page.click(
  W + " tbody tr:nth-child(2) td:nth-child(1) .table-row-drag-handle",
);
await show("click row handle");
await page.click(W + " thead th:nth-child(1) .table-row-drag-handle");
await show("click header row handle");
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)");
await page.hover(W + " .table-row-btn");
await page.waitForTimeout(200);
console.log(
  "hover btn visible:",
  await page.evaluate(() =>
    [".table-row-btn", ".table-col-btn"].map(
      (s) =>
        getComputedStyle(
          document.querySelector(
            ".workspace-leaf.mod-active .cm-table-widget " + s,
          ),
        ).display +
        "/" +
        getComputedStyle(
          document.querySelector(
            ".workspace-leaf.mod-active .cm-table-widget " + s,
          ),
        ).opacity,
    ),
  ),
);
await page.click(W + " .table-row-btn");
await page.waitForTimeout(800);
console.log(
  "after row-btn:",
  JSON.stringify(
    (
      await page.evaluate(
        async () =>
          await app.vault.read(app.vault.getAbstractFileByPath("tb.md")),
      )
    )
      .split("\n")
      .slice(2, 9)
      .join("\n"),
  ),
);
await page.click(W + " .table-col-btn");
await page.waitForTimeout(800);
console.log(
  "after col-btn:",
  JSON.stringify(
    (
      await page.evaluate(
        async () =>
          await app.vault.read(app.vault.getAbstractFileByPath("tb.md")),
      )
    )
      .split("\n")
      .slice(2, 10)
      .join("\n"),
  ),
);
await browser.close();
