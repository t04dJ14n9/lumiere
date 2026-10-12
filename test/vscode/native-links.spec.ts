import { test, expect, chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { paths, readState } from "./state";
import {
  closeBrowser,
  closeEditorGroups,
  workbenchPage,
  QUICK_INPUT,
} from "./workbench";

test("built-in Cmd-click preserves heading fragments and native source caret on new and reused panes", async () => {
  const name = "目标 note.md";
  writeFileSync(
    path.join(paths.workspace, name),
    "# Start\n\n" +
      "Filler paragraph.\n\n".repeat(100) +
      "## Middle target\n\n" +
      "More filler.\n\n".repeat(100) +
      "## Last target\n",
  );
  writeFileSync(
    path.join(paths.workspace, "NativeLinks.md"),
    `[Middle](<${name}#middle-target>)\n\n[Last](<${name}#last-target>)\n\n[Missing](missing.md#target)\n`,
  );
  const browser = await chromium.connectOverCDP(readState().webSocket);
  try {
    const page = workbenchPage(browser);
    await closeEditorGroups(page);
    await page.keyboard.press("ControlOrMeta+p");
    await page.locator(QUICK_INPUT).fill("NativeLinks.md");
    await page
      .locator(".quick-input-list .monaco-list-row")
      .filter({ hasText: "NativeLinks.md" })
      .first()
      .click();
    const status = page.locator('[id="status.editor.selection"]');
    const returnedCarets = new Map<string, string>();
    for (const heading of ["middle-target", "last-target", "middle-target"]) {
      await expect(page.locator(".tab.active")).toContainText("NativeLinks.md");
      const link = page
        .locator(".monaco-editor .detected-link")
        .filter({ hasText: heading });
      await expect(link).toHaveCount(1);
      await page.keyboard.up("Meta");
      await page.keyboard.up("Control");
      await link.click({ force: true });
      const sourceCaret = heading === "last-target" ? "Ln 3," : "Ln 1,";
      await expect(status).toContainText(sourceCaret);
      const beforeClick = await status.innerText();
      await link.click({
        force: true,
        modifiers: [process.platform === "darwin" ? "Meta" : "Control"],
      });
      await expect
        .poll(
          async () => {
            for (const frame of page.frames()) {
              const line = frame.locator(".cm-line").filter({
                hasText: heading
                  .replaceAll("-", " ")
                  .replace(/^./, (c) => c.toUpperCase()),
              });
              if ((await line.count()) && (await line.first().isVisible())) {
                return true;
              }
            }
            return false;
          },
          { timeout: 20000 },
        )
        .toBe(true);
      // Returning through the source tab: VS Code 1.141 does not always push a
      // Go Back history entry when Ctrl/Cmd-click opens our custom Markdown editor.
      await page.locator(".tab").filter({ hasText: "NativeLinks.md" }).click();
      const sourceLink = page
        .locator(".monaco-editor .detected-link")
        .filter({ hasText: heading });
      await expect(sourceLink).toBeVisible();
      await expect(status).toContainText(sourceCaret);
      await expect(status).toHaveText(beforeClick);
      const caret = await status.innerText();
      if (returnedCarets.has(heading)) {
        expect(caret).toBe(returnedCarets.get(heading));
      }
      returnedCarets.set(heading, caret);
    }
    await page
      .locator(".detected-link")
      .filter({ hasText: "missing.md" })
      .click({
        modifiers: [process.platform === "darwin" ? "Meta" : "Control"],
      });
    await expect(page.locator(".notifications-toasts")).toContainText(
      "Could not open precise link",
    );
    await expect(page.locator(".tab.active")).toContainText("NativeLinks.md");
  } catch (error) {
    const page = workbenchPage(browser);
    await test.info().attach("native-link-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    throw error;
  } finally {
    await closeBrowser(browser);
  }
});
