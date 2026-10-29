import assert from "node:assert/strict";
import { test } from "node:test";
import { PdfViewerPanel } from "../../src/host/viewer/panel";
import type { PdfFiles, PdfWebview } from "../../src/shared/host";
import type { HostMessage } from "../../src/shared/messages";
import { parseViewSettings } from "../../src/shared/view-settings";

/** The portable panel on a fake page and fake files: no VS Code. */
function open(files: Partial<PdfFiles> = {}) {
  const posted: HostMessage[] = [];
  const errors: string[] = [];
  const delivered: { size: number; load: number }[] = [];
  let receive: ((message: unknown) => unknown) | undefined;
  let html = "";
  const webview: PdfWebview = {
    cspSource: "'self'",
    asset: (name) => `/lumiere/pdf/viewer/${name}`,
    setHTML: (value) => {
      html = value;
    },
    post: (message) => posted.push(message),
    onMessage: (listener) => {
      receive = listener;
      return () => {
        receive = undefined;
      };
    },
    deliver: (bytes, load) => {
      delivered.push({ size: bytes.byteLength, load });
      return { url: `/lumiere/pdf/bytes?panel=p&load=${load}` };
    },
  };
  const panel = new PdfViewerPanel(
    "file:///papers/paper.pdf",
    webview,
    {
      files: {
        read: async () => new Uint8Array([37, 80, 68, 70]),
        watch: () => () => undefined,
        displayPath: () => "papers/paper.pdf",
        ...files,
      },
      error: (message) => errors.push(message),
      openExternal: async () => undefined,
      refocus: () => undefined,
    },
    {
      toolbar: { mode: "slim", dock: "bottom" },
      settings: parseViewSettings({}),
      position: undefined,
      savePosition: () => undefined,
      route: async () => undefined,
    },
  );
  return {
    panel,
    posted,
    errors,
    delivered,
    html: () => html,
    receive: (message: unknown) => receive?.(message),
  };
}

test("the page's files come from the host's asset URLs", () => {
  const { html } = open();
  assert.match(html(), /src="\/lumiere\/pdf\/viewer\/viewer\.js"/);
  assert.match(
    html(),
    /data-pdfium-wasm="\/lumiere\/pdf\/viewer\/pdfium\.wasm"/,
  );
  assert.match(html(), /data-toolbar="slim"/);
});

test("a load carries the bytes the way the host delivers them", async () => {
  const { posted, delivered, receive } = open();
  await receive({ type: "ready" });
  const load = posted.find((message) => message.type === "load");
  assert.ok(load && "url" in load);
  assert.equal(load.url, "/lumiere/pdf/bytes?panel=p&load=1");
  assert.equal("data" in load, false);
  assert.deepEqual(delivered, [{ size: 4, load: 1 }]);
});

test("a file that cannot be read is reported with its display path, and nothing loads", async () => {
  const { posted, errors, receive } = open({
    read: async () => {
      throw new Error("EACCES");
    },
  });
  await receive({ type: "ready" });
  assert.deepEqual(errors, ["Could not read papers/paper.pdf: Error: EACCES"]);
  assert.equal(
    posted.some((message) => message.type === "load"),
    false,
  );
});

test("a change on disk reloads once the writes settle, with the next load number", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let changed: (() => void) | undefined;
  const { posted, receive } = open({
    watch: (_uri, onChange) => {
      changed = onChange;
      return () => undefined;
    },
  });
  await receive({ type: "ready" });
  changed?.();
  changed?.();
  t.mock.timers.tick(150);
  await new Promise((resolve) => setImmediate(resolve));
  const loads = posted
    .filter((message) => message.type === "load")
    .map((message) => message.load);
  assert.deepEqual(loads, [1, 2]);
});
