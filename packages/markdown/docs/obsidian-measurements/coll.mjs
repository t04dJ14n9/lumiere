import { connect } from "./lib.mjs";
const { browser, page } = await connect();
const res = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  for (const n of ["ca.md", "cb.md"]) {
    let f = app.vault.getAbstractFileByPath(n);
    const body = `---\ntitle: ${n}\ntags: [x]\n---\nBody ${n}`;
    if (!f) await app.vault.create(n, body);
    else await app.vault.modify(f, body);
  }
  const state = () =>
    [
      ...document.querySelectorAll(
        ".workspace-leaf.mod-active .metadata-container",
      ),
    ].map((e) => e.className);
  const open = async (n) => {
    await app.workspace
      .getLeaf(false)
      .openFile(app.vault.getAbstractFileByPath(n));
    await sleep(700);
  };
  await open("ca.md");
  out.push(["ca initial", state()]);
  document
    .querySelector(".workspace-leaf.mod-active .metadata-properties-heading")
    .click();
  await sleep(400);
  out.push(["ca after click", state()]);
  await open("cb.md");
  out.push(["cb opened", state()]);
  await open("ca.md");
  out.push(["ca reopened", state()]);
  document
    .querySelector(".workspace-leaf.mod-active .metadata-properties-heading")
    .click();
  await sleep(400);
  out.push(["ca re-expanded", state()]);
  await open("cb.md");
  out.push(["cb again", state()]);
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
