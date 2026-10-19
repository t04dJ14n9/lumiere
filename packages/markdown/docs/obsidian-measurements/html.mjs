import { connect, observe } from "./lib.mjs";
import fs from "node:fs";
const { browser, page } = await connect();
const doc =
  fs.readFileSync(process.argv[2], "utf8").replace(/\n$/, "") + "\n\n\nIDLE";
const probes = JSON.parse(process.argv[3]);
const obs = await observe(page, "probe-html.md", doc, probes, { html: true });
const norm = (h) =>
  h.replace(/ style="[^"]*"/g, "").replace(/ data-[a-z-]+="[^"]*"/g, "");
const idle = await observe(
  page,
  "probe-html.md",
  doc,
  [{ line: doc.split("\n").length - 1, ch: 0 }],
  { html: true },
);
console.log("IDLE:\n" + norm(idle[0].html).replace(/></g, ">\n<"));
obs.forEach((o) =>
  console.log(
    "\nPROBE " +
      JSON.stringify(o.p) +
      "\n" +
      norm(o.html).replace(/></g, ">\n<"),
  ),
);
await browser.close();
