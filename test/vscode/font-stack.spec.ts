import { test, expect, chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import {
  closeBrowser,
  openWorkbench,
  reopenWith,
  workbenchPage,
} from "./workbench";

interface Measured {
  style: Record<string, string>;
  textWidth: number;
  lineHeight: number;
}

const PROPS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "letterSpacing",
  "wordSpacing",
  "fontFeatureSettings",
  "fontVariationSettings",
  "fontKerning",
  "fontVariantLigatures",
  "fontOpticalSizing",
  "textRendering",
  "webkitFontSmoothing",
  "lineHeight",
  "tabSize",
  "color",
] as const;

async function editorFrame(page: Page): Promise<Frame> {
  for (const frame of page.frames()) {
    if (await frame.locator(".cm-line").count()) {
      return frame;
    }
  }
  throw new Error("No Lumière frame");
}

const scenarios: Record<string, Record<string, unknown>> = {
  // The note's size is its own setting; matching the built-in editor means
  // giving both editors explicit sizes; native platform defaults differ.
  none: {
    "editor.fontSize": 14,
    "editor.lineHeight": 19,
    "lumiere.markdown.editor.fontSize": 14,
    "lumiere.markdown.editor.lineHeight": 19 / 14, // the editor's own 19px
  },
  global: {
    "lumiere.markdown.editor.fontSize": 15,
    "lumiere.markdown.editor.lineHeight": 20 / 15,
    "editor.fontFamily": "DejaVu Sans Mono",
    "editor.fontSize": 15,
    "editor.lineHeight": 20,
    "editor.fontWeight": "500",
    "editor.letterSpacing": 0.4,
    "editor.fontLigatures": true,
  },
  markdown: {
    "lumiere.markdown.editor.fontSize": 18,
    "lumiere.markdown.editor.lineHeight": 24 / 18,
    "editor.fontSize": 13,
    "[markdown]": {
      "editor.fontFamily": "Liberation Mono, monospace",
      "editor.fontSize": 18,
      "editor.lineHeight": 24,
      "editor.fontWeight": "300",
      "editor.letterSpacing": 0.5,
      "editor.fontLigatures": true,
    },
  },
};

for (const [name, extra] of Object.entries(scenarios)) {
  test(`note preserves explicit font settings and uses proportional defaults: ${name}`, async () => {
    const settingsFile = path.join(paths.userData, "User", "settings.json");
    const original = readFileSync(settingsFile, "utf8");
    const note = path.join(paths.workspace, "Note.md");
    const text = readFileSync(note, "utf8");
    writeFileSync(note, "# Native Markdown\n\nOriginal line 0O1lI iiii WWWW\n");
    writeFileSync(
      settingsFile,
      JSON.stringify({ ...(JSON.parse(original) as object), ...extra }),
    );
    const browser = await chromium.connectOverCDP(readState().webSocket);
    const out = process.env.FONT_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
    }
    try {
      const page = workbenchPage(browser);
      await openWorkbench(page);
      const frame = await editorFrame(page);
      await page.waitForTimeout(2500);
      const measure = (selector: string) => `(() => {
        const line = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.replace(/\u00a0/g, " ").includes("Original line"));
        const inner = line.querySelector("span span") ?? line;
        const cs = getComputedStyle(inner);
        const props = ${JSON.stringify(PROPS)};
        const style = Object.fromEntries(props.map((p) => [p, cs[p]]));
        const range = document.createRange();
        range.selectNodeContents(line);
        const rect = line.getBoundingClientRect();
        return { style, textWidth: range.getBoundingClientRect().width, lineHeight: rect.height, box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          vars: ["--vscode-editor-font-family","--vscode-editor-font-size","--vscode-editor-font-weight"].map((v) => v + "=" + getComputedStyle(document.documentElement).getPropertyValue(v)) };
      })()`;
      const wb = (await frame.evaluate(measure(".cm-line"))) as Measured;
      if (out) {
        await frame
          .locator(".cm-line", { hasText: /Original.line/ })
          .first()
          .screenshot({ path: path.join(out, `font-${name}-workbench.png`) });
      }
      await reopenWith(page, "Text Editor");
      await page.locator(".monaco-editor .view-line").first().waitFor();
      await page.waitForTimeout(1500);
      const bi = (await page.evaluate(
        measure(".monaco-editor .view-line"),
      )) as Measured;
      if (out) {
        await page
          .locator(".monaco-editor .view-line", { hasText: /Original.line/ })
          .first()
          .screenshot({ path: path.join(out, `font-${name}-builtin.png`) });
      }
      const diff = Object.fromEntries(
        PROPS.filter((p) => wb.style[p] !== bi.style[p]).map((p) => [
          p,
          { workbench: wb.style[p], builtin: bi.style[p] },
        ]),
      );
      if (out) {
        writeFileSync(
          path.join(out, `font-${name}.json`),
          JSON.stringify({ name, diff, workbench: wb, builtin: bi }, null, 1),
        );
      }
      // Same resolved family stack (including the platform fallbacks), size,
      // weight, spacing, features, line height and advance widths.
      for (const key of [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "letterSpacing",
        "fontFeatureSettings",
        "fontVariationSettings",
        "fontKerning",
        "textRendering",
        "webkitFontSmoothing",
      ] as const) {
        if (name === "none" && key === "fontFamily") {
          expect(wb.style[key]).toContain("sans-serif");
          expect(wb.style[key]).not.toBe(bi.style[key]);
        } else {
          expect(wb.style[key], `${name}: ${key}`).toBe(bi.style[key]);
        }
      }
      expect(wb.lineHeight, `${name}: line height`).toBeCloseTo(
        bi.lineHeight,
        1,
      );
      if (name !== "none") {
        expect(wb.textWidth, `${name}: text width`).toBeCloseTo(
          bi.textWidth,
          1,
        );
      }
    } finally {
      writeFileSync(settingsFile, original);
      writeFileSync(note, text);
      await closeBrowser(browser);
    }
  });
}
