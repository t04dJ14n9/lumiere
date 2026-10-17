import { connect } from "./lib.mjs";
import fs from "node:fs";
export async function session(initial) {
  const { browser, page } = await connect();
  await page.evaluate(async (t) => {
    let f = app.vault.getAbstractFileByPath("pk.md");
    if (!f) f = await app.vault.create("pk.md", t);
    else await app.vault.modify(f, t);
    await app.workspace.getLeaf(false).openFile(f);
    await new Promise((r) => setTimeout(r, 700));
  }, initial);
  const describe = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return "none";
      const row = a.closest(".metadata-property");
      const d = [a.tagName.toLowerCase(), ...[...a.classList].slice(0, 2)].join(
        ".",
      );
      return (
        d +
        (row ? ` [row=${row.dataset.propertyKey}]` : "") +
        (a.value !== undefined && a.tagName === "INPUT"
          ? ` value=${JSON.stringify(a.value)}`
          : a.isContentEditable
            ? ` text=${JSON.stringify(a.textContent)}`
            : "")
      );
    });
  const fm = () =>
    page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 500));
      const f = app.vault.getAbstractFileByPath("pk.md");
      const t = await app.vault.read(f);
      const m = t.match(/^---\n([\s\S]*?)\n---/);
      return m ? m[1] : "(none)\n" + t.slice(0, 80);
    });
  const rows = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".workspace-leaf.mod-active .metadata-property",
        ),
      ].map(
        (r) =>
          r.dataset.propertyKey +
          ":" +
          r.querySelector(".metadata-property-value")?.dataset.propertyType,
      ),
    );
  const log = async (label) =>
    console.log(`${label.padEnd(34)} focus=${await describe()}`);
  return {
    browser,
    page,
    describe,
    fm,
    rows,
    log,
    key: async (k, label) => {
      await page.keyboard.press(k);
      await page.waitForTimeout(250);
      await log(label ?? "press " + k);
    },
    type: async (t) => {
      await page.keyboard.type(t, { delay: 30 });
      await page.waitForTimeout(200);
    },
  };
}
