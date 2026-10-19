import { connect } from "./lib.mjs";
const { browser, page } = await connect();
const items = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".menu")].map((mn) =>
      [...mn.querySelectorAll(".menu-item")]
        .map(
          (m) =>
            (m.className.includes("is-disabled") ? "(dis) " : "") +
            m.querySelector(".menu-item-title")?.textContent +
            (m.querySelector(".menu-item-icon svg")
              ? " [" +
                [...m.querySelector(".menu-item-icon svg").classList]
                  .filter((c) => c.startsWith("lucide"))
                  .join("") +
                "]"
              : "") +
            (m.className.includes("mod-selected") ? " *" : "") +
            (m.querySelector(".menu-item-icon.mod-selected, .is-checked")
              ? " ✓"
              : ""),
        )
        .join(" | "),
    ),
  );
const sel = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
for (const k of ["title", "rating", "tags", "authors", "done"]) {
  await page.click(sel(k) + " .metadata-property-icon");
  await page.waitForTimeout(250);
  await page.hover(".menu .menu-item >> text=Property type");
  await page.waitForTimeout(500);
  console.log("TYPE SUBMENU", k, JSON.stringify(await items()));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}
await page.click(".workspace-leaf.mod-active .metadata-properties-heading", {
  button: "right",
});
await page.waitForTimeout(300);
await page.hover(".menu .menu-item >> text=Sort");
await page.waitForTimeout(500);
console.log("SORT", JSON.stringify(await items()));
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await browser.close();
