import test from "node:test";
import assert from "node:assert/strict";
import {
  embedEditing,
  embedsNote,
  inlineEmbedClick,
} from "../../../src/plugins/embeds/clicks";

test("an embed shows a note when its target has no extension, or .md", () => {
  for (const source of [
    "![[Other]]",
    "![[Other#Heading]]",
    "![[Other^block]]",
    "![[Other|Shown]]",
    "![[folder/Other.md]]",
    "![](Other.md)",
    "![alt](<My Note.md>)",
  ]) {
    assert.equal(embedsNote(source), true, source);
  }
  for (const source of [
    "![[pic.png]]",
    "![[pic.PNG|100]]",
    "![[song.mp3]]",
    "![[clip.mp4]]",
    "![[paper.pdf#page=3]]",
    "![[data.csv]]",
    "![alt](pic.png)",
    "![alt](https://example.com/image)",
  ]) {
    assert.equal(embedsNote(source), false, source);
  }
});

test("as in Obsidian, a click selects an embedded note; an image has no Edit button", () => {
  assert.deepEqual(embedEditing("![[Other]]"), { reveal: "click" });
  // Obsidian 1.13: an image's keys edit it (image-selection.ts).
  assert.deepEqual(embedEditing("![[pic.png]]"), { reveal: "none" });
  const note = inlineEmbedClick("![[Other]]");
  assert.notEqual(note, "none");
  if (note !== "none") {
    assert.deepEqual(note.select("![[Other]]"), { from: 0, to: 10 });
  }
  // Widgets compare the click: the same one for every note.
  assert.equal(inlineEmbedClick("![[A]]"), inlineEmbedClick("![[B]]"));
  assert.equal(inlineEmbedClick("![[pic.png]]"), "none");
});
