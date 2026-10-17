import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

async function settleLayout(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

for (const vim of [false, true]) {
  for (const caret of ["start", "end", "range"] as const) {
    test(`wrapped Chinese tasks keep scroll and ${caret} selection (vim=${vim}) on repeated clicks`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 640, height: 600 });
      const lines = [
        "开头的普通文字",
        "",
        ...Array.from(
          { length: 220 },
          (_, index) =>
            `- [ ] 任务${index}：${"这是一段需要自动换行的中文任务内容，检查滚动位置和光标保持稳定。".repeat(8)}`,
        ),
        "",
        "文档末尾的普通文字",
      ];
      const source = lines.join("\n");
      await open(page, source, "obsidian", {
        features: { vim: { enabled: vim, config: {} } },
      });
      // The harness wraps the editor in a section; constrain it like the webview
      // root so the CodeMirror scroller, rather than the outer page, scrolls.
      await page.addStyleTag({
        content:
          ".panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
      });
      const anchor = caret === "start" ? 2 : source.length - 6;
      const head = caret === "range" ? source.length - 2 : anchor;
      await page.evaluate(
        ({ anchor, head }) => window.harness.reveal(anchor, head),
        { anchor, head },
      );
      await page.locator(".cm-scroller").evaluate((scroller) => {
        scroller.scrollTop =
          (scroller.scrollHeight - scroller.clientHeight) / 2;
      });
      await settleLayout(page);
      const target = await page
        .locator("input[aria-label=Task]")
        .evaluateAll((boxes) => {
          const box = boxes.find((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.top > 180 && bounds.bottom < 420;
          })!;
          const match = /任务(\d+)：/.exec(
            box.closest(".cm-line")!.textContent!,
          )!;
          return Number(match[1]);
        });
      const line = page
        .locator(".cm-line")
        .filter({ hasText: `任务${target}：` });
      expect(
        await line.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
      ).toBeGreaterThan(100);
      const baseline = await page.evaluate(() => window.harness.viewState());
      expect(baseline.scrollTop).toBeGreaterThan(1000);
      expect(baseline.anchor).toBe(anchor);
      expect(baseline.head).toBe(head);
      for (let click = 0; click < 6; click++) {
        await line
          .getByRole("checkbox", { name: "Task" })
          .click({ delay: click % 2 === 0 ? 0 : 100 });
        lines[target + 2] = lines[target + 2]!.replace(
          /^- \[[ x]\]/,
          click % 2 === 0 ? "- [x]" : "- [ ]",
        );
        await expect
          .poll(() => page.evaluate(() => window.harness.text))
          .toBe(lines.join("\n"));
        await settleLayout(page);
        const current = await page.evaluate(() => window.harness.viewState());
        expect(
          Math.abs(current.scrollTop - baseline.scrollTop),
          `click ${click + 1} scroll`,
        ).toBeLessThan(4);
        expect(current.anchor, `click ${click + 1} anchor`).toBe(
          baseline.anchor,
        );
        expect(current.head, `click ${click + 1} head`).toBe(baseline.head);
        await expect(
          page.getByRole("textbox", { name: "Markdown content" }),
        ).toBeFocused({ timeout: 1000 });
      }
    });
  }
}
