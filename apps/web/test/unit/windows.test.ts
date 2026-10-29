// The service worker asks every window of the app; the one that has what
// was asked for answers.
import test from "node:test";
import assert from "node:assert/strict";
import type { Answer } from "../../src/shared/messages";
import { askWindows, type AppWindow } from "../../src/worker/windows";
import { pageResponse } from "../../src/worker/responses";

const QUESTION = { lumiere: "page", id: "p1" } as const;

/** A window that answers `answer` (anything, even what does not parse) after `ms`. */
function window(answer: unknown, ms = 0): AppWindow {
  return {
    postMessage: (_message, [port]) => {
      setTimeout(() => (port as MessagePort).postMessage(answer), ms);
    },
  };
}

const SILENT: AppWindow = { postMessage: () => {} };
const PAGE: Answer = { kind: "page", html: "<p>Note</p>" };

test("the window that has the page answers, whichever answers first", async () => {
  assert.deepEqual(
    await askWindows(
      [
        window({ kind: "unknown" }),
        window(PAGE, 10),
        window({ kind: "unknown" }),
      ],
      QUESTION,
    ),
    PAGE,
  );
});

test("when no window has it, or there is none, there is no answer", async () => {
  assert.equal(
    await askWindows(
      [window({ kind: "unknown" }), window({ kind: "unknown" })],
      QUESTION,
    ),
    undefined,
  );
  assert.equal(await askWindows([], QUESTION), undefined);
});

test("a window that does not answer in time, or answers nonsense, is passed over", async () => {
  assert.equal(await askWindows([SILENT], QUESTION, 20), undefined);
  assert.equal(
    await askWindows([window({ kind: "page" }), window("page")], QUESTION),
    undefined,
  );
  assert.deepEqual(
    await askWindows([SILENT, window(PAGE)], QUESTION, 20),
    PAGE,
  );
  const closed: AppWindow = {
    postMessage: () => {
      throw new Error("The window is closing");
    },
  };
  assert.deepEqual(await askWindows([closed, window(PAGE)], QUESTION), PAGE);
});

test("a page is served as HTML that is not kept or sniffed", async () => {
  const response = pageResponse("<p>Note</p>");
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "text/html; charset=utf-8",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await response.text(), "<p>Note</p>");
});
