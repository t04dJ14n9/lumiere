import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAttachmentDir,
  uniqueTimestampName,
  timestampStem,
  embedFor,
  insertEmbed,
} from "../../../src/attachments";

test("resolveAttachmentDir matches Obsidian attachment folder setting", () => {
  const note = "Projects/Garden/Plan.md";
  for (const [setting, folder] of [
    ["", ""],
    ["/", ""],
    [".", "Projects/Garden"],
    ["./", "Projects/Garden"],
    ["./attachments", "Projects/Garden/attachments"],
    ["./a/b/", "Projects/Garden/a/b"],
    ["Attachments", "Attachments"],
    ["/Attachments/", "Attachments"],
    ["Media/Sketches", "Media/Sketches"],
    ["assets", "assets"],
    ["../outside", ""],
    ["./../../..", ""],
  ] as const) {
    assert.equal(resolveAttachmentDir(setting, note), folder, setting);
  }
  assert.equal(resolveAttachmentDir(".", "Root note.md"), "");
  assert.equal(resolveAttachmentDir("./sub", "Root note.md"), "sub");
});

test("uniqueTimestampName uses YYYY-MM-DD HH.mm.ext and collision suffixes", () => {
  const date = new Date(2026, 9, 30, 14, 52, 3);
  assert.equal(timestampStem(date), "2026-10-30 14.52");
  assert.equal(uniqueTimestampName("png", [], date), "2026-10-30 14.52.png");
  assert.equal(
    uniqueTimestampName("png", ["2026-10-30 14.52.PNG", "other.jpg"], date),
    "2026-10-30 14.52 2.png",
  );
  assert.equal(
    uniqueTimestampName(
      "png",
      ["2026-10-30 14.52.png", "2026-10-30 14.52 2.png"],
      date,
    ),
    "2026-10-30 14.52 3.png",
  );
  assert.equal(
    uniqueTimestampName("sketch.svg", [], date),
    "2026-10-30 14.52.sketch.svg",
  );
});

test("embedFor follows useWikilinks and newLinkFormat", () => {
  const link = {
    path: "Attachments/2026-10-30 14.52.png",
    notePath: "Projects/Plan.md",
    useWikilinks: true,
    format: "shortest" as const,
    isNameUnique: true,
  };
  assert.equal(embedFor(link), "![[2026-10-30 14.52.png]]");
  assert.equal(
    embedFor({ ...link, isNameUnique: false }),
    "![[Attachments/2026-10-30 14.52.png]]",
  );
  assert.equal(
    embedFor({ ...link, format: "absolute" }),
    "![[Attachments/2026-10-30 14.52.png]]",
  );
  assert.equal(
    embedFor({ ...link, format: "relative" }),
    "![[../Attachments/2026-10-30 14.52.png]]",
  );
  assert.equal(
    embedFor({ ...link, useWikilinks: false }),
    "![](2026-10-30%2014.52.png)",
  );
  assert.equal(
    embedFor({ ...link, useWikilinks: false, format: "absolute" }),
    "![](Attachments/2026-10-30%2014.52.png)",
  );
});

function inserted(source: string, caret: number | undefined): string {
  const edit = insertEmbed(source, caret, "![[s]]");
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
}

test("insertEmbed puts the embed in a paragraph of its own", () => {
  assert.equal(inserted("One\nTwo\n", 1), "One\n\n![[s]]\n\nTwo\n");
  assert.equal(inserted("One\n\nTwo", 2), "One\n\n![[s]]\n\nTwo");
  assert.equal(inserted("One\n\nTwo", 4), "One\n\n![[s]]\n\nTwo");
  assert.equal(inserted("One\n\n\nTwo", 5), "One\n\n![[s]]\n\nTwo");
  assert.equal(inserted("One", 3), "One\n\n![[s]]\n");
  assert.equal(inserted("One\n", 4), "One\n\n![[s]]\n");
  assert.equal(inserted("One\n", undefined), "One\n\n![[s]]\n");
  assert.equal(inserted("", 0), "![[s]]\n");
  assert.equal(inserted("One", 99), "One\n\n![[s]]\n");
});

import {
  rewriteRemoteImages,
  remoteImagesInMarkdown,
  decodeDataUri,
  saveAttachment,
} from "../../../src/attachments";
import type { WorkspaceFiles } from "../../../src/shared/workspace-files";

test("remoteImagesInMarkdown finds http and data URI images", () => {
  const md =
    "Hello ![a](https://example.com/x.png) and ![b](data:image/png;base64,aaa) and ![ok](local.png)";
  const found = remoteImagesInMarkdown(md);
  assert.equal(found.length, 2);
  assert.equal(found[0]!.src, "https://example.com/x.png");
  assert.equal(found[1]!.src, "data:image/png;base64,aaa");
});

test("rewriteRemoteImages replaces saved images and leaves failures alone", async () => {
  const md = "![a](https://ex/a.png) ![b](https://ex/b.png)";
  const out = await rewriteRemoteImages(md, async (src) =>
    src.endsWith("a.png") ? "![[2026-10-30 14.52.png]]" : undefined,
  );
  assert.equal(out, "![[2026-10-30 14.52.png]] ![b](https://ex/b.png)");
});

test("decodeDataUri reads png bytes", () => {
  // 1x1 PNG
  const src =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const decoded = decodeDataUri(src);
  assert.ok(decoded);
  assert.equal(decoded!.ext, "png");
  assert.equal(decoded!.bytes[0], 0x89);
});

test("saveAttachment writes under files.attachmentFolder with timestamp name", async () => {
  const written = new Map<string, Uint8Array | string>();
  const files: Pick<
    WorkspaceFiles,
    "list" | "mkdir" | "writeText" | "writeBytes"
  > = {
    list: async () => [],
    mkdir: async () => {},
    writeText: async (uri, text) => {
      written.set(uri, text);
    },
    writeBytes: async (uri, data) => {
      written.set(uri, data);
    },
  };
  const date = new Date(2026, 9, 30, 14, 52);
  const saved = await saveAttachment({
    files,
    root: "file:///vault",
    notePath: "Notes/A.md",
    attachmentFolder: "assets",
    useWikilinks: true,
    format: "shortest",
    ext: "png",
    bytes: new Uint8Array([1, 2, 3]),
    now: date,
    vaultPaths: [],
  });
  assert.ok(saved);
  assert.equal(saved!.path, "assets/2026-10-30 14.52.png");
  assert.equal(saved!.embed, "![[2026-10-30 14.52.png]]");
  assert.ok(
    written.has("file:///vault/assets/2026-10-30%2014.52.png") ||
      [...written.keys()].some((k) => k.includes("14.52")),
  );
});

test("sketch and attachments share the same folder resolution", () => {
  assert.equal(resolveAttachmentDir("assets", "Notes/A.md"), "assets");
  assert.equal(resolveAttachmentDir("./shots", "Notes/A.md"), "Notes/shots");
});
