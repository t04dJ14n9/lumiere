import { connect } from "./lib.mjs";
const { browser, page } = await connect();
await page.evaluate(async () => {
  const f = app.vault.getAbstractFileByPath("Properties.md");
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise((r) => setTimeout(r, 500));
});
const menu = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".menu .menu-item")].map(
      (m) =>
        (m.className.includes("is-disabled") ? "(dis) " : "") +
        (m.className.includes("mod-warning") ? "(warn) " : "") +
        m.querySelector(".menu-item-title")?.textContent +
        (m.querySelector(".menu-item-icon svg")
          ? " [" +
            [...m.querySelector(".menu-item-icon svg").classList]
              .filter((c) => c.startsWith("lucide"))
              .join("") +
            "]"
          : "") +
        (m.querySelector(".menu-item-hotkey")
          ? " {" + m.querySelector(".menu-item-hotkey").textContent + "}"
          : "") +
        (m.className.includes("mod-selected") ? " *" : "") +
        (m.className.includes("has-submenu") ||
        m.querySelector(".menu-item-submenu-indicator")
          ? " >"
          : ""),
    ),
  );
const sel = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
for (const k of ["title", "rating", "tags", "authors"]) {
  await page.click(sel(k) + " .metadata-property-icon");
  await page.waitForTimeout(300);
  console.log("ICON CLICK", k, JSON.stringify(await menu()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}
for (const k of ["title", "tags"]) {
  await page.click(sel(k) + " .metadata-property-key", { button: "right" });
  await page.waitForTimeout(300);
  console.log("CTX KEY", k, JSON.stringify(await menu()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.click(sel(k) + " .metadata-property-value", {
    button: "right",
    position: { x: 5, y: 5 },
  });
  await page.waitForTimeout(300);
  console.log("CTX VALUE", k, JSON.stringify(await menu()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}
// heading context menu
await page.click(".workspace-leaf.mod-active .metadata-properties-heading", {
  button: "right",
});
await page.waitForTimeout(300);
console.log("CTX HEADING", JSON.stringify(await menu()));
await page.keyboard.press("Escape");
await browser.close();
