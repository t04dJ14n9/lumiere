import { expect, test, type Page } from "@playwright/test";
import type { EditorView } from "@codemirror/view";
import { open } from "./harness";

const inputs = [
  { name: "ASCII", end: "$", start: "^" },
  { name: "Chinese punctuation", end: "￥", start: "……" },
  { name: "Chinese single ellipsis", end: "¥", start: "…" },
  { name: "IME Process", end: "Process", start: "Process" },
];

async function shiftedKey(page: Page, key: string, code: string) {
  if (["$", "^"].includes(key)) {
    // Playwright Shift+4 sends key="4"; use the shifted glyph to model the OS.
    await page.keyboard.press("Shift+" + key);
    return;
  }
  await page.evaluate(
    ({ key, code }) => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code,
          shiftKey: true,
          keyCode: key === "Process" ? 229 : Number(code.slice(-1)) + 48,
          isComposing: key === "Process",
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { key, code },
  );
}

async function caret(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement & {
      cmTile?: { view?: EditorView };
    };
    const view = active.cmTile?.view;
    return {
      head: view?.state.selection.main.head,
      text: view?.state.doc.toString(),
      label: active.getAttribute("aria-label"),
    };
  });
}

for (const input of inputs) {
  for (const wrapped of [false, true]) {
    test(`${input.name}: logical line motions in ${wrapped ? "wrapped CJK" : "plain"} prose`, async ({
      page,
    }) => {
      const line = "  " + (wrapped ? "中文段落文字".repeat(40) : "alpha beta");
      const source = `${line}\nnext paragraph`;
      await page.setViewportSize({ width: 420, height: 500 });
      await open(page, source, "obsidian", {
        features: { vim: { enabled: true, config: {} } },
      });
      await page.evaluate(() => window.harness.reveal(5));
      if (wrapped) {
        const height = await page
          .locator(".cm-line")
          .first()
          .evaluate((element) => element.getBoundingClientRect().height);
        expect(height).toBeGreaterThan(40);
      }
      await shiftedKey(page, input.end, "Digit4");
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.harness.viewState())).head,
        )
        .toBe(line.length - 1);
      await shiftedKey(page, input.start, "Digit6");
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.harness.viewState())).head,
        )
        .toBe(2);
      await page.keyboard.press("0");
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.harness.viewState())).head,
        )
        .toBe(0);
      expect(await page.evaluate(() => window.harness.text)).toBe(source);
    });
  }

  test(`${input.name}: cell-local end, first nonblank and start`, async ({
    page,
  }) => {
    const source =
      "before\n\n| alpha beta | other |\n| --- | --- |\n| 中文段落 | next |\n\nafter";
    await open(page, source, "obsidian", {
      features: { vim: { enabled: true, config: {} } },
    });
    await page.locator(".hybrid-table .table-cell-content").first().click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("0");
    // Padding is excluded on entry; create real cell whitespace in this session.
    await page.keyboard.press("i");
    await page.keyboard.insertText("  ");
    await page.keyboard.press("Escape");
    const text = "  alpha beta";
    const editedSource = await page.evaluate(() => window.harness.text);
    await shiftedKey(page, input.end, "Digit4");
    await expect
      .poll(() => caret(page))
      .toEqual({ head: text.length - 1, text, label: "Table cell 1, 1" });
    await shiftedKey(page, input.start, "Digit6");
    await expect
      .poll(() => caret(page))
      .toEqual({ head: 2, text, label: "Table cell 1, 1" });
    await page.keyboard.press("0");
    await expect
      .poll(() => caret(page))
      .toEqual({ head: 0, text, label: "Table cell 1, 1" });
    expect(await page.evaluate(() => window.harness.text)).toBe(editedSource);
  });
}

for (const input of inputs) {
  test(`${input.name}: first-nonblank motion without a preceding end motion`, async ({
    page,
  }) => {
    const source = "  alpha beta\nnext";
    await open(page, source, "obsidian", {
      features: { vim: { enabled: true, config: {} } },
    });
    await page.evaluate(() => window.harness.reveal(8));
    await shiftedKey(page, input.start, "Digit6");
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.harness.viewState())).head,
      )
      .toBe(2);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
  });
}

test("translated motions keep counts, operators and macro recording", async ({
  page,
}) => {
  await open(page, "  alpha beta\nnext line", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(3));
  await page.keyboard.press("2");
  await shiftedKey(page, "￥", "Digit4");
  await expect
    .poll(
      async () => (await page.evaluate(() => window.harness.viewState())).head,
    )
    .toBe(21);
  await page.evaluate(() => window.harness.reveal(3));
  for (const key of "qa") {
    await page.keyboard.press(key);
  }
  await shiftedKey(page, "……", "Digit6");
  await shiftedKey(page, "Process", "Digit4");
  await page.keyboard.press("x");
  await page.keyboard.press("q");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("  alpha bet\nnext line");
  await page.keyboard.press("@");
  await page.keyboard.press("a");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("  alpha be\nnext line");
  await shiftedKey(page, "……", "Digit6");
  await page.keyboard.press("d");
  await shiftedKey(page, "￥", "Digit4");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("  \nnext line");
});

test("translated keys honor user mappings", async ({ page }) => {
  await open(page, "alpha beta", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(5));
  for (const key of ":nmap $ 0") {
    await page.keyboard.press(key);
  }
  await page.keyboard.press("Enter");
  await shiftedKey(page, "￥", "Digit4");
  await expect
    .poll(
      async () => (await page.evaluate(() => window.harness.viewState())).head,
    )
    .toBe(0);
  expect(await page.evaluate(() => window.harness.text)).toBe("alpha beta");
});

test("literal character arguments retain Chinese punctuation", async ({
  page,
}) => {
  await open(page, "x￥yz", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("f");
  await shiftedKey(page, "￥", "Digit4");
  await expect
    .poll(
      async () => (await page.evaluate(() => window.harness.viewState())).head,
    )
    .toBe(1);
  await page.keyboard.press("l");
  await page.keyboard.press("r");
  await shiftedKey(page, "￥", "Digit4");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe("x￥￥z");
});

for (const cell of [false, true]) {
  test(`Chinese punctuation stays literal in ${cell ? "cell" : "paragraph"} insert mode`, async ({
    page,
  }) => {
    const source = cell ? "| alpha |\n| --- |\n| beta |" : "alpha";
    await open(page, source, "obsidian", {
      features: { vim: { enabled: true, config: {} } },
    });
    if (cell) {
      await page.locator(".hybrid-table .table-cell-content").first().click();
      await page.keyboard.press("Escape");
    } else {
      await page.evaluate(() => window.harness.reveal(0));
    }
    await page.keyboard.press("0");
    await page.keyboard.press("i");
    await shiftedKey(page, "￥", "Digit4");
    await shiftedKey(page, "……", "Digit6");
    await page.keyboard.insertText("￥……");
    await expect.poll(async () => (await caret(page)).text).toBe("￥……alpha");
    await page.keyboard.press("Escape");
  });
}

test("an active composition does not become a Vim motion", async ({ page }) => {
  await open(page, "alpha beta", "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal(3));
  await page.evaluate(() =>
    document.activeElement?.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    ),
  );
  await shiftedKey(page, "Process", "Digit4");
  await shiftedKey(page, "Process", "Digit6");
  expect((await page.evaluate(() => window.harness.viewState())).head).toBe(3);
  expect(await page.evaluate(() => window.harness.text)).toBe("alpha beta");
  await page.evaluate(() =>
    document.activeElement?.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    ),
  );
});
