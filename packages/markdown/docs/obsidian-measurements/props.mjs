import { connect } from "./lib.mjs";
const { browser, page } = await connect();
const out = await page.evaluate(async () => {
  const f = app.vault.getAbstractFileByPath("Properties.md");
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise((r) => setTimeout(r, 800));
  const c = document.querySelector(
    ".workspace-leaf.mod-active .metadata-container",
  );
  const clean = (el) => {
    const n = el.cloneNode(true);
    n.querySelectorAll("svg").forEach((s) => {
      s.replaceWith(
        document.createTextNode(
          "{svg:" +
            [...s.classList].filter((x) => x.startsWith("lucide")).join("") +
            "}",
        ),
      );
    });
    return n.outerHTML;
  };
  return {
    container: c.className,
    html: clean(c),
    types: app.metadataTypeManager?.properties
      ? Object.fromEntries(
          Object.entries(app.metadataTypeManager.properties).map(([k, v]) => [
            k,
            v.widget,
          ]),
        )
      : null,
  };
});
console.log(out.container);
console.log(out.html.replace(/></g, ">\n<").slice(0, 9000));
console.log(JSON.stringify(out.types));
await browser.close();
