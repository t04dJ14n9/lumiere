import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Browser, Page } from "@playwright/test";
import { workbenchPage } from "../vscode/workbench";

function page(url: string, isClosed = false): Page {
  return { url: () => url, isClosed: () => isClosed } as Page;
}

function browser(...contexts: Page[][]): Browser {
  return {
    contexts: () => contexts.map((pages) => ({ pages: () => pages })),
  } as Browser;
}

test("native workbench lookup skips DevTools and closed pages across contexts", () => {
  const workbench = page("vscode-file://vscode-app/workbench.html");
  assert.equal(
    workbenchPage(
      browser(
        [page("devtools://devtools/bundled/inspector.html")],
        [page("vscode-file://closed", true), workbench],
      ),
    ),
    workbench,
  );
});

test("native workbench lookup reports the startup log after a renderer exits", () => {
  for (const candidate of [
    browser(),
    browser([page("devtools://inspector")]),
  ]) {
    assert.throws(
      () => workbenchPage(candidate),
      /No live VS Code workbench page\. Check .*startup\.log for a renderer crash or process termination/,
    );
  }
});
