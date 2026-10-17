// Measures Obsidian's default note typography: body, heading, code, table,
// properties, footnote and line-number sizes. Run against Obsidian started as
// described in README.md, with default appearance settings.
import { connect } from "./lib.mjs";
const NOTE = `---
title: Typography
tags: [a]
---
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

Body text with \`inline code\` and a footnote.[^1]

- list item

| a | b |
|---|---|
| 1 | 2 |

\`\`\`js
const x = 1;
\`\`\`

[^1]: The footnote text.
`;
const size = Number(process.argv[2] ?? 16);
const { browser, page } = await connect();
const result = await page.evaluate(
  async ({ text, size }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    app.vault.setConfig("showLineNumber", true);
    app.saveLocalStorage("base-font-size", size);
    app.updateFontSize();
    let file = app.vault.getAbstractFileByPath("font-size.md");
    if (!file) file = await app.vault.create("font-size.md", text);
    else await app.vault.modify(file, text);
    await app.workspace.getLeaf(false).openFile(file);
    await sleep(800);
    const view = app.workspace.activeEditor;
    view.editor.setCursor({ line: 40, ch: 0 });
    await sleep(300);
    const root = document.querySelector(".workspace-leaf.mod-active");
    const style = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        fontWeight: s.fontWeight,
        fontFamily: s.fontFamily.slice(0, 60),
        height: r.height,
      };
    };
    const q = (sel) => root.querySelector(sel);
    const bodyVars = getComputedStyle(document.body);
    const vars = {};
    for (const name of [
      "--font-text-size",
      "--font-small",
      "--font-smaller",
      "--font-smallest",
      "--font-ui-small",
      "--line-height-normal",
      "--line-height-tight",
      "--code-size",
      "--font-monospace-default",
      "--h1-size",
      "--h2-size",
      "--h3-size",
      "--h4-size",
      "--h5-size",
      "--h6-size",
      "--h1-line-height",
      "--h2-line-height",
      "--h3-line-height",
      "--h4-line-height",
      "--h5-line-height",
      "--h6-line-height",
      "--h1-weight",
      "--h6-weight",
      "--table-text-size",
      "--metadata-label-font-size",
      "--metadata-input-font-size",
      "--footnote-size",
      "--file-line-width",
    ])
      vars[name] = bodyVars.getPropertyValue(name).trim();
    const out = { vars };
    out.body = style(
      q(".cm-line:not(.HyperMD-header):not(.HyperMD-list-line)"),
    );
    out.content = style(q(".cm-content"));
    for (let n = 1; n <= 6; n++)
      out["h" + n] = style(q(".HyperMD-header-" + n));
    out.inlineCode = style(q(".cm-inline-code"));
    out.codeLine = style(q(".HyperMD-codeblock"));
    out.tableCell = style(q(".cm-table-widget td, .table-cell-wrapper"));
    out.propertyLabel = style(
      q(".metadata-property-key-input, .metadata-property-key"),
    );
    out.propertyValue = style(
      q(".metadata-input-longtext, .metadata-property-value"),
    );
    out.footnoteRef = style(q(".cm-footref, sup"));
    out.footnoteLine = style(q(".HyperMD-footnote"));
    out.gutter = style(
      q(".cm-lineNumbers .cm-gutterElement:not([style*='height: 0'])"),
    );
    out.gutterElements = [
      ...root.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
    ]
      .slice(0, 14)
      .map((e) => [
        e.textContent,
        e.getBoundingClientRect().height,
        e.getBoundingClientRect().top,
      ]);
    return out;
  },
  { text: NOTE, size },
);
console.log(JSON.stringify(result, null, 1));
await browser.close();
