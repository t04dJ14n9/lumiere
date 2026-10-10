import { session } from "./pk.mjs";
const s = await session(
  "---\ntitle: Hello\nnum: 3\nflag: true\nlist:\n  - a\n  - b\n---\nbody\n",
);
const { page } = s;
const R = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
await page.click(R("title") + " .metadata-property-key-input");
await s.log("click title key");
await s.key("Tab");
await s.key("Tab", "Tab again");
await s.key("Tab", "Tab again");
await s.key("Tab", "Tab again");
await page.click(R("title") + " .metadata-property-key-input");
await s.key("Enter", "Enter in key");
await s.key("Enter", "Enter in value");
await s.key("ArrowDown", "ArrowDown in value");
await s.key("ArrowUp", "ArrowUp");
await s.key("Escape", "Escape");
await s.key("ArrowDown", "ArrowDown (row focus?)");
await s.key("ArrowDown");
await s.key("ArrowUp");
await s.key("Enter", "Enter on row");
await s.key("Escape");
console.log(await s.rows());
await s.key("Delete", "Delete on row");
console.log(await s.rows());
console.log(await s.fm());
await s.browser.close();
