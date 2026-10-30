import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PdfViewerPanel } from "../../src/host/viewer/panel";
import type { PdfFiles, PdfWebview } from "../../src/shared/host";
import type { HostMessage } from "../../src/shared/messages";
import { parseViewSettings } from "../../src/shared/view-settings";

const INITIAL = new Uint8Array([37, 80, 68, 70]); // %PDF
const INITIAL_SHA = createHash("sha256").update(INITIAL).digest("hex");

function open(files: Partial<PdfFiles> = {}) {
  const posted: HostMessage[] = [];
  const errors: string[] = [];
  let receive: ((message: unknown) => unknown) | undefined;
  let watchCb: (() => void) | undefined;
  let writes = 0;
  const webview: PdfWebview = {
    cspSource: "'self'",
    asset: (name) => `/lumiere/pdf/viewer/${name}`,
    setHTML: () => undefined,
    post: (message) => posted.push(message),
    onMessage: (listener) => {
      receive = listener;
      return () => {
        receive = undefined;
      };
    },
    deliver: (bytes, load) => ({
      url: `/lumiere/pdf/bytes?panel=p&load=${load}`,
    }),
  };
  let disk = INITIAL;
  const panel = new PdfViewerPanel(
    "file:///papers/paper.pdf",
    webview,
    {
      files: {
        read: async () => disk,
        watch: (_uri, onChange) => {
          watchCb = onChange;
          return () => {
            watchCb = undefined;
          };
        },
        displayPath: () => "papers/paper.pdf",
        hash: async () => createHash("sha256").update(disk).digest("hex"),
        writeAtomic: async (_uri, bytes) => {
          writes += 1;
          disk = new Uint8Array(bytes);
          return {
            sha256: createHash("sha256").update(disk).digest("hex"),
          };
        },
        ...files,
      },
      error: (message) => errors.push(message),
      openExternal: async () => undefined,
      refocus: () => undefined,
    },
    {
      toolbar: { mode: "chrome", dock: "bottom" },
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
    writes: () => writes,
    triggerWatch: () => watchCb?.(),
    receive: (message: unknown) => receive?.(message),
  };
}

test("annotationSave overwrites and suppresses watcher reload", async () => {
  const { posted, receive, writes, triggerWatch } = open();
  await receive({ type: "ready" });
  const load = posted.find((m) => m.type === "load");
  assert.ok(load && load.type === "load");
  assert.equal(load.sha256, INITIAL_SHA);

  const next = new Uint8Array([37, 80, 68, 70, 45, 97]); // %PDF-a
  const before = posted.length;
  await receive({
    type: "annotationSave",
    load: load.load,
    baseSha256: INITIAL_SHA,
    data: next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength),
  });
  assert.equal(writes(), 1);
  const result = posted.slice(before).find((m) => m.type === "annotationSaveResult");
  assert.ok(result && result.type === "annotationSaveResult" && result.ok);
  const loadsBeforeWatch = posted.filter((m) => m.type === "load").length;
  triggerWatch();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    posted.filter((m) => m.type === "load").length,
    loadsBeforeWatch,
    "self-write must not reload the viewer",
  );
});

test("annotationSave conflicts when disk hash diverges", async () => {
  let writes = 0;
  const { posted, receive, panel } = open({
    hash: async () => "other-disk-hash",
    writeAtomic: async () => {
      writes += 1;
      return { sha256: "unused" };
    },
  });
  const conflicts: unknown[] = [];
  panel.onAnnotationConflict((payload) => conflicts.push(payload));
  await receive({ type: "ready" });
  const load = posted.find((m) => m.type === "load");
  assert.ok(load && load.type === "load");
  await receive({
    type: "annotationSave",
    load: load.load,
    baseSha256: load.sha256,
    data: new ArrayBuffer(4),
  });
  assert.equal(writes, 0);
  assert.equal(conflicts.length, 1);
  const result = posted.find((m) => m.type === "annotationSaveResult");
  assert.ok(result && result.type === "annotationSaveResult" && !result.ok);
  if (result && result.type === "annotationSaveResult" && !result.ok) {
    assert.equal(result.reason, "conflict");
  }
});
