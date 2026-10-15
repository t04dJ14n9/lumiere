import test from "node:test";
import assert from "node:assert/strict";
import type { VaultIndex } from "../vault/api";
import type { LinkSyntax } from "../../shared/vault-path";
import { NoteResources, resourceKind } from "./note-resources";

test("resource kinds preserve note and PDF precedence and unknown-file fallback", () => {
  assert.equal(resourceKind("Note.MD"), "note");
  assert.equal(resourceKind("file.PDF"), "pdf");
  assert.equal(resourceKind("photo.png"), "image");
  assert.equal(resourceKind("sound.mp3"), "audio");
  assert.equal(resourceKind("clip.mp4"), "video");
  assert.equal(resourceKind("note.markdown"), "file");
  assert.equal(resourceKind("other.bin"), "file");
});

test("resource loading defaults to markdown syntax", async () => {
  const root = "vscode-remote://host/vault";
  const seen: Array<LinkSyntax | undefined> = [];
  const resources = new NoteResources({
    source: `${root}/notes/source.md`,
    vault: {
      root,
      resolveLink(_linktext: string, _source: string, syntax?: LinkSyntax) {
        seen.push(syntax);
        return {
          path: "notes/image.png",
          uri: `${root}/notes/image.png`,
          basename: "image",
          extension: "png",
          mtime: 1,
          size: 1,
        };
      },
    } as unknown as VaultIndex,
    files: {
      async stat() {
        return { mtime: 1, symbolicLink: false };
      },
      async read() {
        return new Uint8Array();
      },
    },
    resourceUrl: (uri) => uri,
  });
  await resources.load("image.png");
  assert.deepEqual(seen, ["markdown"]);
});
