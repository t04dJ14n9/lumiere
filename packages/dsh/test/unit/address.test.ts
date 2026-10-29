import test from "node:test";
import assert from "node:assert/strict";
import {
  addressFragment,
  insideWorkspace,
  parentFolder,
  parseSessionAddress,
  sessionAddress,
  workspaceRoot,
} from "../../src/client/address";
import { followOpens, isEditorDocument } from "../../src/client/index";

test("a session address reads back to its session and decoded path", () => {
  assert.deepEqual(
    parseSessionAddress(
      "dsh-resource://file/session/s-1/notes/Start%20here.md#x",
    ),
    { sessionId: "s-1", path: "notes/Start here.md" },
  );
  assert.equal(
    addressFragment("dsh-resource://file/session/s-1/notes/Start%20here.md#x"),
    "#x",
  );
  assert.equal(
    addressFragment("dsh-resource://file/session/s-1/notes/Start%20here.md"),
    "",
  );
  assert.equal(
    parseSessionAddress("dsh-resource://file/absolute/a.md"),
    undefined,
  );
  assert.equal(
    parseSessionAddress("dsh-resource://file/session/s-1"),
    undefined,
  );
  assert.equal(
    parseSessionAddress("dsh-resource://file/session/s/%E0"),
    undefined,
  );
});

test("the workspace root is the absolute path without the relative one", () => {
  const address = "dsh-resource://file/session/s/notes/Start%20here.md";
  assert.equal(workspaceRoot(address, "/v/notes/Start here.md"), "/v");
  assert.equal(workspaceRoot(address, "/elsewhere/x.md"), undefined);
  assert.equal(
    workspaceRoot("dsh-resource://file/session/s//v/a.md", "/v/a.md"),
    undefined,
  );
  assert.equal(parentFolder("/v/notes/Start here.md"), "/v/notes");
  assert.equal(parentFolder("/a.md"), undefined);
});

test("a page may open a file inside its workspace and not a prefix or the disk root", () => {
  assert.equal(insideWorkspace("/v", "/v/notes/A.md"), true);
  assert.equal(insideWorkspace("/v/", "/v"), true);
  assert.equal(insideWorkspace("/v", "/vault/A.md"), false);
  assert.equal(insideWorkspace("/v", "/v/../etc/passwd"), false);
  assert.equal(insideWorkspace("/", "/etc/passwd"), false);
  assert.equal(insideWorkspace(undefined, "/v/A.md"), false);
});

test("another note's address is relative to the workspace, encoded like DSH's, and keeps fragments", () => {
  assert.equal(
    sessionAddress("s 1", "/v", "/v/notes/A #1.md"),
    "dsh-resource://file/session/s%201/notes/A%20%231.md",
  );
  assert.equal(
    sessionAddress("s", "/v", "/v/notes/B.md", "#Heading"),
    "dsh-resource://file/session/s/notes/B.md#Heading",
  );
  assert.equal(
    sessionAddress("s", "/v", "/other/C:x.md"),
    "dsh-resource://file/session/s//other/C:x.md",
  );
});

test("followOpens enforces workspace containment even when workspaceRoot is undefined and forwards fragments", () => {
  const prevWindow = globalThis.window;
  const prevLocation = globalThis.location;
  try {
    let listener: ((event: MessageEvent) => void) | undefined;
    globalThis.location = { origin: "http://127.0.0.1:3000" } as Location;
    globalThis.window = {
      addEventListener: (_type: string, fn: (event: MessageEvent) => void) => {
        listener = fn;
      },
      removeEventListener: () => {
        listener = undefined;
      },
    } as unknown as Window & typeof globalThis;

    const contentWindow = {} as Window;
    const frame = {
      current: { contentWindow } as unknown as HTMLIFrameElement,
    };
    const opened: string[] = [];

    // 1. When both root and containmentRoot are undefined, open messages are refused.
    const stopWithoutRoot = followOpens(frame, {
      sessionId: "s1",
      root: undefined,
      open: (addr) => opened.push(addr),
    });
    listener?.({
      origin: "http://127.0.0.1:3000",
      source: contentWindow,
      data: { lumiere: "open", path: "/etc/passwd", fragment: "" },
    } as unknown as MessageEvent);
    assert.equal(opened.length, 0);
    stopWithoutRoot();

    // 2. When workspaceRoot is undefined for an absolute session address, containmentRoot (parentFolder) guards it.
    const stopWithFallback = followOpens(frame, {
      sessionId: "s1",
      root: undefined,
      containmentRoot: parentFolder("/v/notes/Start.md"),
      open: (addr) => opened.push(addr),
    });
    listener?.({
      origin: "http://127.0.0.1:3000",
      source: contentWindow,
      data: { lumiere: "open", path: "/etc/passwd", fragment: "" },
    } as unknown as MessageEvent);
    listener?.({
      origin: "http://127.0.0.1:3000",
      source: contentWindow,
      data: {
        lumiere: "open",
        path: "/v/notes/sub/Next.md",
        fragment: "#Section",
      },
    } as unknown as MessageEvent);
    assert.deepEqual(opened, [
      "dsh-resource://file/session/s1//v/notes/sub/Next.md#Section",
    ]);
    stopWithFallback();
  } finally {
    globalThis.window = prevWindow;
    globalThis.location = prevLocation;
  }
});

test("isEditorDocument distinguishes a Lumière editor page from HTTP 400/403 error responses", () => {
  assert.equal(isEditorDocument(null), false);
  assert.equal(isEditorDocument(undefined), false);
  assert.equal(isEditorDocument({ querySelector: () => null }), false);
  assert.equal(
    isEditorDocument({
      querySelector: (sel) =>
        sel === 'meta[name="lumiere-panel"]' ? { content: "p1" } : null,
    }),
    true,
  );
});
