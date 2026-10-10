import { connect } from "./lib.mjs";
const { page } = await connect();
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const root = document.querySelector(".workspace-leaf.mod-active");
      const centre = (e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        const b = r.getBoundingClientRect();
        return Math.round((b.top + b.height / 2) * 10) / 10;
      };
      return [...root.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
        .filter((g) => ["9", "10", "15"].includes(g.textContent))
        .map((g) => ({
          n: g.textContent,
          c: centre(g),
          top: g.getBoundingClientRect().top,
        }))
        .concat([
          {
            hdr: centre(root.querySelector(".cm-table-widget th")),
            wtop: root.querySelector(".cm-table-widget").getBoundingClientRect()
              .top,
          },
        ]);
    }),
  ),
);
process.exit(0);
