import { session } from "./pk.mjs";
const s = await session(
  "---\ntitle: Hello\nnum: 3\nflag: true\nlist:\n  - a\n  - b\ntags:\n  - t1\n---\nbody\n",
);
const { page } = s;
const R = (k) =>
  `.workspace-leaf.mod-active .metadata-property[data-property-key="${k}"]`;
const F = async (l) => {
  console.log("  fm:", JSON.stringify(await s.fm()));
};
// row focus + delete
await page.focus(R("num"));
await s.log("focus row num");
await s.key("Backspace", "Backspace on row");
console.log(await s.rows());
await F();
await page.focus(R("flag"));
await s.key("Delete", "Delete on row flag");
console.log(await s.rows());
// checkbox toggle with space
await s.browser.close();
