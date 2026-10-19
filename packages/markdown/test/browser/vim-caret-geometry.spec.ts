import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

const settings = {
  fontFamily: "DejaVu Sans Mono",
  fontSize: 20,
  cursorStyle: "line",
  cursorWidth: 2,
  cursorBlinking: "solid",
  cursorSmoothCaretAnimation: "off",
};

async function configure(page: Page, values: Record<string, unknown> = {}) {
  await page.evaluate((values) => window.harness.configureEditor(values), {
    ...settings,
    ...values,
  });
}

/** The caret's box next to the browser's own box for the grapheme containing `head`. */
async function caretAndCluster(page: Page, line: number, head: number) {
  return page.evaluate(
    ({ line, head }) => {
      const element = document.querySelectorAll(".cm-line")[line]!;
      const clusters = [
        ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
          element.textContent ?? "",
        ),
      ];
      const cluster = clusters.find(
        (item) => head < item.index + item.segment.length,
      )!;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let range: DOMRect | undefined;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.nodeValue!.length;
        if (cluster.index < offset + length) {
          const r = document.createRange();
          r.setStart(node, cluster.index - offset);
          r.setEnd(node, cluster.index - offset + cluster.segment.length);
          range = r.getBoundingClientRect();
          break;
        }
        offset += length;
      }
      const caret = document.querySelector(".mw-caret")!;
      const box = caret.getBoundingClientRect();
      return {
        expected: cluster.segment,
        shown: caret.textContent,
        caret: { left: box.left, width: box.width, height: box.height },
        cluster: range && { left: range.left, width: range.width },
      };
    },
    { line, head },
  );
}

const rows = [
  ["emoji", "a🙂b🙂"],
  ["combining mark", "ae\u0301xe\u0301"],
  ["ZWJ family", "a👨‍👩‍👧z👨‍👩‍👧"],
  ["CJK", "a中文z"],
  ["right to left Hebrew", "אבגדה"],
  ["right to left Arabic", "مرحبا"],
] as const;

for (const scale of [1, 2]) {
  test.describe(`device scale factor ${scale}`, () => {
    test.use({ deviceScaleFactor: scale });
    test(`normal-mode block covers the whole grapheme (emoji, combining marks, ZWJ, CJK, RTL)`, async ({
      page,
    }) => {
      await open(page, rows.map(([, text]) => text).join("\n"), "obsidian", {
        features: { vim: { enabled: true, config: {} } },
      });
      await configure(page);
      await page.evaluate(() => window.harness.reveal(0));
      await page.keyboard.press("Escape");
      let start = 0;
      for (const [index, [name, text]] of rows.entries()) {
        await page.evaluate((offset) => window.harness.reveal(offset), start);
        await page.keyboard.press("0");
        // Vim steps by code point, so a head can sit inside a cluster; the
        // block must still cover the complete cluster that contains it.
        let previous = -1;
        for (let step = 0; step < text.length; step++) {
          const head = await page.evaluate(
            async () => (await window.harness.capture()).from,
          );
          if (head === previous) {
            break;
          }
          previous = head;
          const local = head - start;
          expect(local, `${name} head`).toBeGreaterThanOrEqual(0);
          expect(local, `${name} head`).toBeLessThan(text.length);
          await expect
            .poll(
              async () => (await caretAndCluster(page, index, local)).shown,
              {
                message: `${name} head ${local}`,
              },
            )
            .toBe((await caretAndCluster(page, index, local)).expected);
          const { caret, cluster } = await caretAndCluster(page, index, local);
          expect(cluster, `${name} head ${local} has a box`).toBeDefined();
          expect(
            Math.abs(caret.left - cluster!.left),
            `${name} head ${local} left`,
          ).toBeLessThan(1.5);
          expect(
            Math.abs(caret.width - cluster!.width),
            `${name} head ${local} width`,
          ).toBeLessThan(1.5);
          await page.keyboard.press("l");
        }
        start += text.length + 1;
      }
    });
  });
}

test("ligature fonts: the block covers one character cell and shows that character, not the ligature", async ({
  page,
}) => {
  await open(page, "a => b != c", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await configure(page, { fontFamily: "Fira Code", fontLigatures: true });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("Escape");
  const advance = await page.evaluate(() => {
    const line = document.querySelector(".cm-line")!;
    const text = line.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    return range.getBoundingClientRect().width;
  });
  // Fira Code draws `=>` as one glyph across two cells; the monospace cell is unchanged.
  await page.keyboard.press("0");
  await page.keyboard.press("2");
  await page.keyboard.press("l");
  const caret = page.locator(".mw-caret").first();
  await expect(caret.locator(".mw-caret-shape")).toHaveText("=");
  await expect
    .poll(async () => (await caret.boundingBox())!.width)
    .toBeCloseTo(advance, 0);
  await page.keyboard.press("l");
  await expect(caret.locator(".mw-caret-shape")).toHaveText(">");
});

test("the caret layer follows the Vim plugin and the panel: no duplicates, no detached nodes, no accumulating listeners", async ({
  page,
}) => {
  await open(page, "alpha\nbeta", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await configure(page);
  const cdp = await page.context().newCDPSession(page);
  const listeners = async () => {
    const counts: Record<string, number> = {};
    for (const [name, expression] of [
      ["dom", "document.querySelector('.cm-editor')"],
      ["scroller", "document.querySelector('.cm-scroller')"],
      ["content", "document.querySelector('.cm-content')"],
      ["document", "document"],
      ["window", "window"],
    ] as const) {
      const { result } = await cdp.send("Runtime.evaluate", { expression });
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
        objectId: result.objectId!,
      });
      counts[name] = listeners.length;
    }
    return counts;
  };
  const layers = () => page.locator(".mw-caret-layer").count();
  await expect.poll(layers).toBe(1);
  await page.keyboard.press("Escape");
  // Turning Vim off hands the layer back to the native caret, in place.
  await page.evaluate(async () => {
    const root = window.harness.views[0]!;
    const vim = [...root.plugins].find(
      (fiber) => fiber.definition.name === "vim",
    )!;
    await vim.dispose();
    await root.settled();
  });
  await expect(page.locator(".mw-editor")).toHaveAttribute(
    "data-caret-mode",
    "typing",
  );
  await expect.poll(layers).toBe(1);

  // Panels come and go (the editor is reopened, split, closed): nothing the
  // caret registered on the page or window may outlive its panel.
  const before = await listeners();
  for (let cycle = 0; cycle < 4; cycle++) {
    await page.evaluate(async () => {
      const panel = await window.harness.open("obsidian");
      await panel.settled();
      await panel.dispose();
      window.harness.views.pop();
    });
    await expect.poll(layers).toBe(1);
  }
  expect(await listeners()).toEqual(before);

  // Disposing the panel removes its layer and leaves no caret node alive.
  await page.evaluate(async () => {
    const [panel] = window.harness.views.splice(0, 1);
    await panel!.dispose();
  });
  await expect(page.locator(".mw-caret-layer")).toHaveCount(0);
  await cdp.send("HeapProfiler.collectGarbage");
  const prototype = await cdp.send("Runtime.evaluate", {
    expression: "HTMLDivElement.prototype",
  });
  const instances = await cdp.send("Runtime.queryObjects", {
    prototypeObjectId: prototype.result.objectId!,
  });
  const { result } = await cdp.send("Runtime.callFunctionOn", {
    objectId: instances.objects.objectId!,
    functionDeclaration:
      "function() { const count = (name) => this.filter((element) => element.classList.contains(name) && !element.isConnected).length; return { caret: count('mw-caret'), layer: count('mw-caret-layer'), editor: count('cm-editor'), scroller: count('cm-scroller') }; }",
    returnByValue: true,
  });
  // The browser host keeps its endpoints (and so a disposed panel's views)
  // reachable, so whole editors can stay alive; the caret must add nothing
  // to that: no layer or caret node outlives the editor that owned it.
  const detached = result.value as Record<string, number>;
  expect(detached.layer, JSON.stringify(detached)).toBeLessThanOrEqual(
    detached.editor!,
  );
  expect(detached.caret, JSON.stringify(detached)).toBeLessThanOrEqual(
    detached.editor! * 4,
  );
});

test("two panels each keep their own caret layer", async ({ page }) => {
  await open(page, "alpha\nbeta", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(async () => {
    await window.harness.open("obsidian");
  });
  await expect(page.locator(".mw-caret-layer")).toHaveCount(2);
  await page.evaluate(async () => {
    await window.harness.views[1]!.dispose();
  });
  await expect(page.locator(".mw-caret-layer")).toHaveCount(1);
});
