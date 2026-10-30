import test from "node:test";
import assert from "node:assert/strict";
import { markdownFromHtml } from "../../../src/plugins/pasteHtml/conversion";
import {
  rewriteRemoteImages,
  decodeDataUri,
} from "../../../src/attachments";
import {
  isAttachmentDrag,
  urisFromDataTransfer,
  shouldClaimEditorDrop,
} from "../../../src/attachments/drop";

function transfer(partial: {
  types?: string[];
  files?: File[];
  getData?: (type: string) => string;
}): DataTransfer {
  const types = partial.types ?? [];
  const files = partial.files ?? [];
  return {
    types,
    files: files as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    getData: partial.getData ?? (() => ""),
    setData() {},
    clearData() {},
    setDragImage() {},
    dropEffect: "none",
    effectAllowed: "all",
  } as DataTransfer;
}

test("isAttachmentDrag claims Files and uri-list payloads", () => {
  assert.equal(isAttachmentDrag(null), false);
  assert.equal(isAttachmentDrag(transfer({ types: ["text/plain"] })), false);
  assert.equal(isAttachmentDrag(transfer({ types: ["Files"] })), true);
  assert.equal(
    isAttachmentDrag(transfer({ types: ["text/uri-list"] })),
    true,
  );
  assert.equal(
    isAttachmentDrag(
      transfer({ types: ["application/vnd.code.uri-list"] }),
    ),
    true,
  );
  assert.equal(
    isAttachmentDrag(
      transfer({
        types: [],
        files: [new File([new Uint8Array([1])], "a.png", { type: "image/png" })],
      }),
    ),
    true,
  );
});

test("urisFromDataTransfer reads text/uri-list and code uri-list", () => {
  assert.deepEqual(
    urisFromDataTransfer(
      transfer({
        types: ["text/uri-list"],
        getData: (type) =>
          type === "text/uri-list"
            ? "file:///tmp/a.png\r\n#comment\r\nhttps://ex/b.png\n"
            : "",
      }),
    ),
    ["file:///tmp/a.png", "https://ex/b.png"],
  );
  assert.deepEqual(
    urisFromDataTransfer(
      transfer({
        types: ["application/vnd.code.uri-list"],
        getData: (type) =>
          type === "application/vnd.code.uri-list"
            ? JSON.stringify(["file:///vault/shot.png"])
            : "",
      }),
    ),
    ["file:///vault/shot.png"],
  );
});

test("shouldClaimEditorDrop is true for file drags so VS Code must not open tabs", () => {
  assert.equal(
    shouldClaimEditorDrop(transfer({ types: ["Files"] })),
    true,
  );
  assert.equal(
    shouldClaimEditorDrop(transfer({ types: ["text/plain"] })),
    false,
  );
});

test("rich HTML data+http images rewrite to embeds after conversion", async () => {
  const md = markdownFromHtml(
    '<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" alt="green"><img src="https://example.com/remote.png" alt="remote"></p>',
  );
  assert.ok(md);
  assert.match(md!, /!\[green\]\(data:image\/png;base64,/);
  assert.match(md!, /!\[remote\]\(https:\/\/example\.com\/remote\.png\)/);

  const out = await rewriteRemoteImages(md!, async (src) => {
    if (src.startsWith("data:")) {
      const decoded = decodeDataUri(src);
      assert.ok(decoded);
      return "![[2026-10-30 15.00.png]]";
    }
    if (src.startsWith("https:")) {
      return "![[2026-10-30 15.01.png]]";
    }
    return undefined;
  });
  assert.equal(
    out.includes("![[2026-10-30 15.00.png]]"),
    true,
  );
  assert.equal(
    out.includes("![[2026-10-30 15.01.png]]"),
    true,
  );
  assert.equal(out.includes("data:image"), false);
  assert.equal(out.includes("https://example.com"), false);
});

import {
  isHostSourceUrl,
  loadAttachmentSource,
} from "../../../src/attachments/source";

test("isHostSourceUrl accepts http(s) and file, not data URIs", () => {
  assert.equal(isHostSourceUrl("https://ex/a.png"), true);
  assert.equal(isHostSourceUrl("http://ex/a.png"), true);
  assert.equal(isHostSourceUrl("file:///tmp/a.png"), true);
  assert.equal(isHostSourceUrl("data:image/png;base64,aaa"), false);
  assert.equal(isHostSourceUrl("javascript:alert(1)"), false);
});

test("loadAttachmentSource downloads http and reads file URIs", async () => {
  const http = await loadAttachmentSource("https://ex/a.png", {
    fetch: async () => ({
      ok: true,
      headers: { get: (name) => (name === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }),
    readFile: async () => undefined,
  });
  assert.ok(http);
  assert.equal(http!.ext, "png");
  assert.deepEqual([...http!.bytes], [1, 2, 3]);

  const file = await loadAttachmentSource("file:///vault/shot.jpg", {
    fetch: async () => {
      throw new Error("no network for file");
    },
    readFile: async () => new Uint8Array([9, 8]),
  });
  assert.ok(file);
  assert.equal(file!.ext, "jpg");
  assert.deepEqual([...file!.bytes], [9, 8]);

  const fail = await loadAttachmentSource("https://ex/missing.png", {
    fetch: async () => ({
      ok: false,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
    readFile: async () => undefined,
  });
  assert.equal(fail, undefined);
});

test("urisFromDataTransfer reads VS Code ResourceURLs JSON", () => {
  assert.deepEqual(
    urisFromDataTransfer(
      transfer({
        types: ["ResourceURLs"],
        getData: (type) =>
          type === "ResourceURLs"
            ? JSON.stringify(["file:///vault/pic.png"])
            : "",
      }),
    ),
    ["file:///vault/pic.png"],
  );
  assert.equal(
    isAttachmentDrag(transfer({ types: ["ResourceURLs"] })),
    true,
  );
});
