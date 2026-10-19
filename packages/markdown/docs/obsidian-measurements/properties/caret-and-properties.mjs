// Where the caret and focus go around the frontmatter / Properties widget in Obsidian 1.14.4 Live Preview.
import { connect } from "./lib.mjs";
const { page } = await connect();
const NOTE = "---\ntitle: T\ntags:\n  - a\n---\nFirst body line\nSecond line\n";
const BODY = 5; // 0-based line of "First body line"
const log = (label, v) => console.log(label.padEnd(44), JSON.stringify(v));
const reset = async (text = NOTE, line = BODY, ch = 0) => {
  await page.evaluate(
    async ([text, line, ch]) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await app.workspace
        .getLeaf(false)
        .openFile(app.vault.getAbstractFileByPath("Welcome.md"));
      await sleep(400);
      let f = app.vault.getAbstractFileByPath("pc.md");
      if (!f) f = await app.vault.create("pc.md", text);
      else await app.vault.modify(f, text);
      await app.workspace.getLeaf(false).openFile(f);
      await sleep(900);
      const ed = app.workspace.activeEditor.editor;
      ed.setValue(text);
      await sleep(300);
      ed.focus();
      ed.setCursor({ line, ch });
      await sleep(400);
    },
    [text, line, ch],
  );
};
const where = () =>
  page.evaluate(() => {
    const ed = app.workspace.activeEditor.editor;
    const a = document.activeElement;
    const c = ed.getCursor("head");
    const s = ed.getCursor("anchor");
    const inProps = a.closest(".metadata-container");
    return {
      cursor: `${c.line}:${c.ch}`,
      anchor: `${s.line}:${s.ch}`,
      active:
        a.tagName + "." + String(a.className).split(" ").slice(0, 2).join("."),
      inProperties: !!inProps,
      focusKey:
        a.closest("[data-property-key]")?.getAttribute("data-property-key") ??
        null,
      title: a.classList.contains("inline-title"),
    };
  });
const press = async (keys) => {
  await page.keyboard.press(keys);
  await page.waitForTimeout(350);
};
const visibleLines = () =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".workspace-leaf.mod-active .cm-content .cm-line",
      ),
    ]
      .map((l) => l.textContent)
      .slice(0, 8),
  );

await reset();
const expanded = async () => {
  const collapsed = await page.evaluate(
    () =>
      !!document.querySelector(
        ".workspace-leaf.mod-active .metadata-container.is-collapsed",
      ),
  );
  if (collapsed) {
    await page.click(".workspace-leaf.mod-active .metadata-properties-heading");
    await page.waitForTimeout(300);
  }
};
await expanded();
await reset();
log("initial (cursor at body start)", await where());
log("visible lines", await visibleLines());
await press("ArrowUp");
log("ArrowUp from body line 1", await where());
await press("ArrowUp");
log("ArrowUp again", await where());
await press("ArrowUp");
log("ArrowUp 3rd", await where());
await press("ArrowUp");
log("ArrowUp 4th", await where());
await press("ArrowUp");
log("ArrowUp 5th", await where());
await press("ArrowUp");
log("ArrowUp 6th", await where());
await press("ArrowDown");
log("ArrowDown from there", await where());
await press("ArrowDown");
log("ArrowDown again", await where());

await reset();
await press("ArrowLeft");
log("ArrowLeft at body start", await where());
await reset();
await press("Control+Home");
log("Ctrl+Home from body start", await where());
await reset(NOTE, BODY + 1, 3);
await press("Control+Home");
log("Ctrl+Home from deeper", await where());
await reset();
await press("Shift+ArrowUp");
log("Shift+ArrowUp from body start", await where());
await reset();
await press("Shift+Control+Home");
log("Shift+Ctrl+Home", await where());
await reset();
await press("Control+a");
log("Ctrl+A", await where());
await reset();
await press("PageUp");
log("PageUp from body start", await where());
await reset();
await press("Control+ArrowUp");
log("Ctrl+ArrowUp from body start", await where());
await reset();
await press("Alt+ArrowUp");
log("Alt+ArrowUp from body start", await where());
await reset();
await press("Backspace");
log("Backspace at body start: where", await where());
log(
  "  note after",
  await page.evaluate(() => app.workspace.activeEditor.editor.getValue()),
);
await reset(NOTE, 4, 0);
log("setCursor into closing --- (4:0)", await where());
log("  visible lines", await visibleLines());
await reset(NOTE, 1, 3);
log("setCursor into frontmatter (1:3)", await where());
log("  visible lines", await visibleLines());
await press("ArrowDown");
log("  ArrowDown from inside frontmatter", await where());
await reset(NOTE, 1, 3);
await press("ArrowUp");
log("  ArrowUp from inside frontmatter", await where());
await reset(NOTE, 1, 3);
await press("Control+Home");
log("  Ctrl+Home from inside frontmatter", await where());
await reset(NOTE, 1, 3);
await page.keyboard.type("X");
await page.waitForTimeout(300);
log(
  "  typing X inside frontmatter: note",
  await page.evaluate(() => app.workspace.activeEditor.editor.getValue()),
);
// Click on the Properties container background and on the heading.
await reset();
const box = await page
  .locator(".workspace-leaf.mod-active .metadata-container")
  .boundingBox();
log("properties box", box);
await page.mouse.click(box.x + box.width - 6, box.y + 6);
await page.waitForTimeout(350);
log("click properties top-right padding", await where());
await reset();
await page.mouse.click(box.x + box.width - 6, box.y + box.height - 4);
await page.waitForTimeout(350);
log("click properties bottom padding", await where());
await reset();
const heading = await page
  .locator(".workspace-leaf.mod-active .metadata-properties-heading")
  .boundingBox();
await page.mouse.click(
  heading.x + heading.width - 20,
  heading.y + heading.height / 2,
);
await page.waitForTimeout(350);
log("click heading (right of title)", await where());
log(
  "  collapsed afterwards",
  await page.evaluate(
    () =>
      !!document.querySelector(
        ".workspace-leaf.mod-active .metadata-container.is-collapsed",
      ),
  ),
);
await expanded();
await reset();
await expanded();
// ArrowUp from the middle of the first body line, and the way back down.
await reset(NOTE, BODY, 4);
await press("ArrowUp");
log("ArrowUp from 5:4", await where());
await press("ArrowDown");
log("  ArrowDown from Add property button", await where());
await reset(NOTE, BODY, 4);
await press("ArrowUp");
await press("ArrowUp");
await press("Escape");
log("  up to last row, Escape", await where());
await press("ArrowDown");
log("  ArrowDown after Escape", await where());
await reset(NOTE, BODY, 4);
await press("ArrowUp");
await press("Tab");
log("  Tab from Add property button", await where());
await reset(NOTE, BODY, 4);
await press("ArrowUp");
await press("Shift+Tab");
log("  Shift+Tab from Add property button", await where());
await reset(NOTE, BODY, 4);
await press("Shift+ArrowUp");
log("Shift+ArrowUp from 5:4", await where());
await reset(NOTE, BODY + 1, 4);
await press("ArrowUp");
log("ArrowUp from 6:4 to line 5", await where());
await press("ArrowUp");
log("  and again", await where());
await reset(NOTE, 6, 11);
await press("Shift+Control+Home");
log("Shift+Ctrl+Home from 6:11 (selects to body start?)", await where());
await reset(NOTE, 6, 11);
await press("Shift+ArrowUp");
await press("Shift+ArrowUp");
log("Shift+ArrowUp x2 from 6:11", await where());
await reset();
await expanded();
const first = await page
  .locator(".workspace-leaf.mod-active .metadata-property")
  .first()
  .boundingBox();
await page.mouse.click(first.x + first.width - 4, first.y + first.height / 2);
await page.waitForTimeout(350);
log("click first property row (empty area)", await where());
await press("ArrowDown");
log("  then ArrowDown", await where());
await press("Escape");
log("  then Escape", await where());
await press("ArrowDown");
log("  then ArrowDown after Escape", await where());
// Click in the gap between properties and first body line, and above.
await reset();
const gap = await page.evaluate(() => {
  const r = document
    .querySelector(".workspace-leaf.mod-active .metadata-container")
    .getBoundingClientRect();
  const l = [
    ...document.querySelectorAll(
      ".workspace-leaf.mod-active .cm-content .cm-line",
    ),
  ]
    .find((x) => x.textContent.startsWith("First"))
    .getBoundingClientRect();
  return { x: l.x + 20, y: (r.bottom + l.top) / 2, r: r.bottom, l: l.top };
});
log("gap geometry", gap);
await page.mouse.click(gap.x, gap.y);
await page.waitForTimeout(350);
log("click between properties and body", await where());
// Document of only frontmatter.
await reset("---\ntitle: T\n---\n", 0, 0);
log("frontmatter-only note, initial", await where());
await press("ArrowDown");
log("  ArrowDown", await where());
await press("Control+End");
log("  Ctrl+End", await where());
await press("Control+Home");
log("  Ctrl+Home", await where());
// Empty body after frontmatter, typing
await reset("---\ntitle: T\n---\n\nbody\n", 4, 0);
await press("ArrowUp");
log("ArrowUp from body past blank line", await where());
await press("ArrowUp");
log("  ArrowUp again", await where());
process.exit(0);
