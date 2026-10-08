import test from "node:test";
import assert from "node:assert/strict";
import { resourceKind } from "./note-resources";

test("resource kinds preserve note and PDF precedence and unknown-file fallback", () => {
  assert.equal(resourceKind("Note.MD"), "note");
  assert.equal(resourceKind("file.PDF"), "pdf");
  assert.equal(resourceKind("photo.png"), "image");
  assert.equal(resourceKind("sound.mp3"), "audio");
  assert.equal(resourceKind("clip.mp4"), "video");
  assert.equal(resourceKind("note.markdown"), "file");
  assert.equal(resourceKind("other.bin"), "file");
});
