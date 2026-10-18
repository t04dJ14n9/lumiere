/**
 * The extension in VS Code for the Web, where it runs in the browser's
 * web-worker extension host (src/extension.web.ts): notes in Live Preview,
 * the vault index and search in web workers, links between notes, PDFs,
 * and no desktop-only commands.
 */
import { expect, test, type Frame, type Page } from "@playwright/test";
import { readState } from "./state";

async function openWorkbench(page: Page): Promise<void> {
  await page.goto(readState().url);
  await expect(page.locator(".monaco-workbench")).toBeVisible({
    timeout: 60_000,
  });
  await expect(explorerRow(page, "Welcome.md")).toBeVisible({
    timeout: 30_000,
  });
}

function explorerRow(page: Page, name: string) {
  return page
    .locator(`.explorer-viewlet .monaco-list-row[aria-label^="${name}"]`)
    .first();
}

/** The webview frame whose page shows `text`: a note's or the PDF viewer's. */
async function frameShowing(page: Page, text: string): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const shows = await frame
            .evaluate(
              (wanted) => document.body?.innerText.includes(wanted),
              text,
            )
            .catch(() => false);
          if (shows) {
            found = frame;
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return found!;
}

/** The worker scripts the page loads, by name (`vault.js`, `search.js`). */
function watchWorkerScripts(page: Page): Set<string> {
  const scripts = new Set<string>();
  page.context().on("request", (request) => {
    const name = /\/dist\/markdown\/workers\/([\w-]+\.js)$/.exec(request.url());
    if (name) {
      scripts.add(name[1]!);
    }
  });
  return scripts;
}

async function openWelcome(page: Page): Promise<Frame> {
  await openWorkbench(page);
  await explorerRow(page, "Welcome.md").click();
  return frameShowing(page, "A link to");
}

test("a note opens in Live Preview, with its properties, callout, math and Mermaid", async ({
  page,
}) => {
  const note = await openWelcome(page);
  await expect(
    note.getByRole("textbox", { name: "Property name: status" }),
  ).toBeVisible();
  await expect(note.getByText("A callout")).toBeVisible();
  await expect(note.locator("mjx-container").first()).toBeVisible();
  await expect(note.locator("svg[id^='mw-']").first()).toBeVisible({
    timeout: 20_000,
  });
});

test("the vault is indexed in a web worker: the Tags view lists the vault's tags", async ({
  page,
}) => {
  const workers = watchWorkerScripts(page);
  await openWelcome(page);
  const tags = page.locator(".pane", { hasText: "Tags" });
  await expect(tags.getByText("topic")).toBeVisible({ timeout: 20_000 });
  await expect(tags.getByText("demo")).toBeVisible();
  expect(workers.has("vault.js")).toBe(true);
});

test("a query block lists the matching notes, evaluated in the search worker", async ({
  page,
}) => {
  const workers = watchWorkerScripts(page);
  const note = await openWelcome(page);
  await expect(note.getByText("Search target")).toBeVisible({
    timeout: 20_000,
  });
  expect(workers.has("search.js")).toBe(true);
});

test("a wikilink opens the other note", async ({ page }) => {
  const note = await openWelcome(page);
  await note.getByText("Second note", { exact: true }).first().click();
  await expect(
    page.locator(".tabs-container .tab", { hasText: "Second note.md" }),
  ).toBeVisible();
  await frameShowing(page, "Back to");
});

test("a PDF link opens PDF Workshop at its page", async ({ page }) => {
  const note = await openWelcome(page);
  await note.getByText("page 3 of the paper").click();
  await expect(
    page.locator(".tabs-container .tab", { hasText: "five.pdf" }),
  ).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("Page 3 / 5", {
    timeout: 30_000,
  });
});

test("desktop-only commands are not offered", async ({ page }) => {
  await openWelcome(page);
  await explorerRow(page, "Welcome.md").click();
  await page.keyboard.press("F1");
  const input = page.locator(".quick-input-box input");
  const list = page.locator(".quick-input-list");
  // A command every platform has, so the palette has our commands loaded.
  await input.fill(">Markdown Workshop: Toggle Vim Mode");
  await expect(list).toContainText("Toggle Vim Mode");
  for (const command of [
    "Open Rendered Git Diff",
    "Toggle Inline Git Changes",
    "Copy MCP Setup",
  ]) {
    await input.fill(`>${command}`);
    await expect(list.locator(".monaco-list-row").first()).toBeVisible();
    await expect(list).not.toContainText(command);
  }
});
