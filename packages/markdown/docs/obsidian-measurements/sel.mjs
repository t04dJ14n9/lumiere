import { connect, observe } from "./lib.mjs";
const { browser, page } = await connect();
const line = "aa **b1** bb **b2** cc **b3** dd";
const text = line + "\n\nplain";
const els = ["**b1**", "**b2**", "**b3**"].map((e) => ({
  e,
  s: line.indexOf(e),
  t: line.indexOf(e) + e.length,
}));
const sels = [
  [0, 2],
  [0, 3],
  [0, 5],
  [0, 12],
  [5, 17],
  [9, 10],
  [10, 11],
  [10, 13],
  [12, 20],
  [0, 32],
  [4, 4],
];
const obs = await observe(
  page,
  "probe-sel.md",
  text,
  sels.map(([a, b]) => ({
    sel: [
      { line: 0, ch: a },
      { line: 0, ch: b },
    ],
  })),
);
sels.forEach(([a, b], i) => console.log(a, b, JSON.stringify(obs[i].lines[0])));
// multi cursor
const mc = await page.evaluate(async () => {
  const ed = app.workspace.activeEditor.editor;
  ed.setSelections([
    { anchor: { line: 0, ch: 5 }, head: { line: 0, ch: 5 } },
    { anchor: { line: 0, ch: 25 }, head: { line: 0, ch: 25 } },
  ]);
  await new Promise((r) => setTimeout(r, 100));
  return document.querySelector(".workspace-leaf.mod-active .cm-line")
    .innerText;
});
console.log("multi", JSON.stringify(mc));
await browser.close();
