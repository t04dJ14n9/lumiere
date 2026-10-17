import { session } from "./pk.mjs";
const s = await session(
  "---\ntitle: Hello\nnum: 3\nflag: true\nlist:\n  - a\n  - b\ntags:\n  - t1\n---\nbody\n",
);
const { page } = s;
const R = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
// list/pills
await page.click(R("list") + " .multi-select-input");
await s.log("click list input");
await s.type("c");
await s.key("Enter", "Enter after 'c'");
console.log(" fm:", JSON.stringify(await s.fm()));
await s.key("Backspace", "Backspace on empty input");
await s.key("Backspace", "Backspace again");
console.log(" fm:", JSON.stringify(await s.fm()));
await s.key("ArrowLeft", "ArrowLeft");
await s.key("ArrowLeft", "ArrowLeft");
await s.key("Delete", "Delete on pill");
console.log(" fm:", JSON.stringify(await s.fm()));
await s.type("x,y");
await s.key("Enter");
console.log(" fm:", JSON.stringify(await s.fm()));
await s.key("Tab", "Tab from pill input");
await s.key("Tab");
// tags: leading # and spaces
await page.click(R("tags") + " .multi-select-input");
await s.type("#new tag");
await s.key("Enter");
console.log(" fm:", JSON.stringify(await s.fm()));
// pill click edits?
await page.click(R("tags") + " .multi-select-pill-content >> nth=0");
await s.log("click pill");
await s.type("Z");
await s.key("Enter", "Enter in edited pill");
console.log(" fm:", JSON.stringify(await s.fm()));
await page.click(R("tags") + " .multi-select-pill-remove-button >> nth=0");
console.log(" after remove x:", JSON.stringify(await s.fm()));
// checkbox
await page.click(R("flag") + " input.metadata-input-checkbox");
console.log(" fm after click checkbox:", JSON.stringify(await s.fm()));
await page.focus(R("flag") + " input.metadata-input-checkbox");
await s.key("Space", "Space on checkbox");
console.log(" fm:", JSON.stringify(await s.fm()));
// number
await page.click(R("num") + " input");
await page.keyboard.press("Control+a");
await s.type("4.5");
await s.key("Enter", "Enter in number");
console.log(" fm:", JSON.stringify(await s.fm()));
await page.click(R("num") + " input");
await page.keyboard.press("Control+a");
await page.keyboard.press("Backspace");
await s.key("Enter", "empty number Enter");
console.log(" fm:", JSON.stringify(await s.fm()));
// text
await page.click(R("title") + " .metadata-input-longtext");
await page.keyboard.press("Control+a");
await s.type("a: b # c");
await s.key("Enter");
console.log(" fm:", JSON.stringify(await s.fm()));
await page.click(R("title") + " .metadata-input-longtext");
await page.keyboard.press("End");
await s.key("Shift+Enter", "Shift+Enter in text");
await s.type("line2");
await s.key("Enter");
console.log(" fm:", JSON.stringify(await s.fm()));
await s.browser.close();
