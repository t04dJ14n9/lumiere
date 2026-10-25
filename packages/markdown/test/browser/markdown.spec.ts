import { test, expect } from "@playwright/test";
import { build } from "esbuild";
test("pure dialect, metadata and renderer run unchanged in Chromium", async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      contents: `
    import { Text } from '@codemirror/state';
    import { metadata } from './src/markdown/metadata';
    import { createRenderer } from './src/markdown/html';
    import { markdownLanguageSupport, markdownParser } from './src/markdown/dialect';
    const doc = Text.of(['# Browser', '', '[[Note]] #tag']);
    const result = metadata(doc);
    // Host/workers use the base Lezer parser; LanguageSupport wraps it with
    // CodeMirror language-data props (a configured copy). Both must share the
    // same dialect root type — reference equality would fail after the split.
    const support = markdownLanguageSupport();
    if (support.language.name !== 'markdown') throw new Error('not markdown');
    const sample = '# Browser\\n\\n[[Note]]';
    if (markdownParser.parse(sample).type.name !== support.language.parser.parse(sample).type.name) {
      throw new Error('Parser mismatch');
    }
    document.body.innerHTML = createRenderer().renderMarkdown(doc.toString());
    document.body.dataset.links = String(result.links.length);
  `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "chrome120",
  });
  await page.setContent("<body></body>");
  await page.addScriptTag({
    type: "module",
    content: bundle.outputFiles[0]!.text,
  });
  await expect(page.locator("h1")).toHaveText("Browser");
  await expect(page.locator("a.internal-link")).toHaveText("Note");
  await expect(page.locator("body")).toHaveAttribute("data-links", "1");
});
