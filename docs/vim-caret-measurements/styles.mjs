// How VSCodeVim's insert/normal/visual/replace carets follow editor.cursorStyle and editor.cursorWidth.
import { launch } from "./lib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const root = "/tmp/vsvim";
const out = {};
const { page, stop } = await launch({ root, extensions: `${root}/ext`, workspace: `${root}/ws`, file: `${root}/ws/sample.txt`, settings: { "editor.cursorBlinking": "solid" } });
const set = async (extra) => { const fs = await import("node:fs"); const p = `${root}/ud/User/settings.json`; fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, "utf8")), ...extra })); await page.waitForTimeout(1500); };
const read = () => page.evaluate(() => [...document.querySelectorAll(".part.editor .cursors-layer .cursor")].map((c) => { const r = c.getBoundingClientRect(); const s = getComputedStyle(c); return `${r.width}x${r.height} ${document.querySelector(".part.editor .cursors-layer").className.match(/cursor-[a-z-]+-style/)?.[0]} bg=${s.backgroundColor} bt=${s.borderTopWidth} bb=${s.borderBottomWidth}`; }).join(" ; "));
try {
  const ed = page.locator(".part.editor .monaco-editor").first();
  await ed.locator(".view-lines").waitFor({ timeout: 30000 }); await page.waitForTimeout(5000);
  await ed.locator(".view-lines").click({ position: { x: 600, y: 300 } });
  await page.keyboard.press("Escape"); await page.keyboard.type("gg0w");
  for (const [style, width] of [["line", 0], ["block", 0], ["underline", 0], ["line-thin", 0], ["block-outline", 0], ["underline-thin", 0], ["line", 4]]) {
    await set({ "editor.cursorStyle": style, "editor.cursorWidth": width });
    const row = {};
    await page.keyboard.press("Escape"); await page.waitForTimeout(250); row.normal = await read();
    await page.keyboard.type("i"); await page.waitForTimeout(250); row.insert = await read();
    await page.keyboard.press("Escape"); await page.keyboard.type("R"); await page.waitForTimeout(250); row.replace = await read();
    await page.keyboard.press("Escape"); await page.keyboard.type("v"); await page.waitForTimeout(250); row.visual = await read();
    await page.keyboard.press("Escape");
    out[`${style}/${width}`] = row; console.log(style, width, JSON.stringify(row));
  }
} finally { mkdirSync(new URL("./results/", import.meta.url).pathname, { recursive: true }); writeFileSync(new URL("./results/vscodevim-styles.json", import.meta.url).pathname, JSON.stringify(out, null, 1)); await stop(); }
