import { test, expect } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { open } from "./harness";

const source =
  "Before the code.\n\n```js\nconst alpha = 1;\nconst beta = alpha + 2;\n```\n\nAfter the code.";
for (const dark of [false, true]) {
  for (const vim of [false, true]) {
    test(`code selection ${dark ? "dark" : "light"} ${vim ? "Vim" : "mouse"}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 960, height: 720 });
      await open(page, source, "obsidian", {
        features: { vim: { enabled: vim, config: {} } },
      });
      await page.evaluate((dark) => {
        // VS Code always sets the theme kind on the body; the blend follows it.
        document.body.classList.remove("vscode-light", "vscode-dark");
        document.body.classList.add(dark ? "vscode-dark" : "vscode-light");
        const style = document.documentElement.style;
        style.setProperty(
          "--vscode-editor-background",
          dark ? "#1e1e1e" : "#ffffff",
        );
        style.setProperty(
          "--vscode-editor-foreground",
          dark ? "#d4d4d4" : "#202020",
        );
        style.setProperty(
          "--vscode-textCodeBlock-background",
          dark ? "#282828" : "#f2f3f5",
        );
        style.setProperty(
          "--vscode-editor-selectionBackground",
          dark ? "#264f78" : "#add6ff",
        );
      }, dark);
      const begin = source.indexOf("const alpha");
      const end = source.indexOf(";", source.indexOf("const beta")) + 1;
      for (const crossing of [false, true]) {
        const from = crossing ? 0 : begin;
        const to = crossing ? source.length : end;
        await page.keyboard.press("Escape");
        await page.evaluate((from) => window.harness.reveal(from), from);
        if (vim) {
          await page.keyboard.press("v");
          await page.keyboard.press(crossing ? "Shift+G" : "j");
          await page.keyboard.press("$");
        } else {
          const points = await page.evaluate(
            ({ from, to }) => {
              const context = [...window.harness.views[0]!.plugins].find(
                (fiber) => fiber.definition.name === "livePreview",
              )!.context!;
              const view = context.editor.view;
              return [view.coordsAtPos(from)!, view.coordsAtPos(to)!];
            },
            { from, to },
          );
          await page.mouse.move(
            points[0]!.left + 0.1,
            (points[0]!.top + points[0]!.bottom) / 2,
          );
          await page.mouse.down();
          await page.mouse.move(
            points[1]!.left + 0.1,
            (points[1]!.top + points[1]!.bottom) / 2,
            { steps: 10 },
          );
          await page.mouse.up();
        }
        const selected = await page.evaluate(() => window.harness.capture());
        expect(selected.text).toBe(source.slice(from, to));
        expect(await page.evaluate(() => window.harness.text)).toBe(source);
        await expect(
          page.locator(".mw-selection-layer .cm-selectionBackground").first(),
        ).toBeVisible();
        const copied = await page.evaluate(() => {
          const data = new DataTransfer();
          document.activeElement!.dispatchEvent(
            new ClipboardEvent("copy", {
              bubbles: true,
              cancelable: true,
              clipboardData: data,
            }),
          );
          return data.getData("text/plain");
        });
        expect(copied).toBe(source.slice(from, to));
        const point = await page
          .locator(".cm-line", { hasText: "const alpha" })
          .evaluate((line) => {
            // The space after `const`: selected, and no glyph pixels. The
            // selection hugs the text, so the line's right side is untinted.
            const walker = document.createTreeWalker(
              line,
              NodeFilter.SHOW_TEXT,
            );
            let offset = 0;
            let node: Node | null;
            while ((node = walker.nextNode())) {
              const text = node.nodeValue ?? "";
              const index = 5 - offset;
              if (index >= 0 && index < text.length && text[index] === " ") {
                const range = document.createRange();
                range.setStart(node, index);
                range.setEnd(node, index + 1);
                const rect = range.getBoundingClientRect();
                return {
                  x: Math.floor((rect.left + rect.right) / 2),
                  y: Math.floor((rect.top + rect.bottom) / 2),
                };
              }
              offset += text.length;
            }
            throw new Error("no space after const");
          });
        const pixels = await page.screenshot();
        const pixel = await page.evaluate(
          async ({ bytes, point }) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: "image/png" }),
            );
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(bitmap, 0, 0);
            return [...context.getImageData(point.x, point.y, 1, 1).data].slice(
              0,
              3,
            );
          },
          { bytes: [...pixels], point },
        );
        // 62633ed's see-through accent tint over the code-block background
        // (#282828 / #f2f3f5): screen-blended on dark, multiplied on light.
        const expected = dark ? [75, 71, 102] : [217, 215, 239];
        pixel.forEach((channel, index) =>
          expect(Math.abs(channel - expected[index]!)).toBeLessThanOrEqual(2),
        );
        // Optional review screenshots: SELECTION_SHOTS=<dir>.
        const dir = process.env.SELECTION_SHOTS;
        if (!dir) {
          continue;
        }
        mkdirSync(dir, { recursive: true });
        await page.screenshot({
          path: path.join(
            dir,
            `${process.env.SELECTION_PHASE ?? "after"}-${dark ? "dark" : "light"}-${vim ? "vim" : "mouse"}-${crossing ? "cross" : "inside"}.png`,
          ),
        });
      }
    });
  }
}
