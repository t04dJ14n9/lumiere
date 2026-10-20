import test from "node:test";
import assert from "node:assert/strict";
import {
  aliasRange,
  steppedWidth,
  targetRange,
  withWidth,
  writtenHeight,
  writtenWidth,
} from "../../../src/plugins/embeds/image-size";

// Measured in Obsidian 1.14.4: + and - on a selected image.
test("a step goes to the next or previous multiple of 25, within the text's width", () => {
  // A 64 px image: 75, 100, 125, then back 100, 75, 50, 25.
  const up = [64];
  for (let i = 0; i < 3; i++) {
    up.push(steppedWidth(up.at(-1)!, 1, 316));
  }
  assert.deepEqual(up, [64, 75, 100, 125]);
  const down = [125];
  for (let i = 0; i < 4; i++) {
    down.push(steppedWidth(down.at(-1)!, -1, 316));
  }
  assert.deepEqual(down, [125, 100, 75, 50, 25]);
  assert.equal(steppedWidth(25, -1, 316), 25);
  // A 400 px image shown at the text's 316 px: up stays there, down steps.
  assert.equal(steppedWidth(400, 1, 316), 316);
  assert.equal(steppedWidth(400, -1, 316), 300);
  assert.equal(steppedWidth(316, -1, 316), 300);
});

test("the size is the last | part of an embed, or of a Markdown image's alt text", () => {
  assert.equal(withWidth("![[pic.png]]", 75), "![[pic.png|75]]");
  assert.equal(withWidth("![[pic.png|75]]", 100), "![[pic.png|100]]");
  assert.equal(withWidth("![[pic.png|75]]", undefined), "![[pic.png]]");
  assert.equal(withWidth("![[pic.png|alt|10x5]]", 50), "![[pic.png|alt|50]]");
  assert.equal(withWidth("![](wide.png)", 316), "![316](wide.png)");
  assert.equal(withWidth("![316](wide.png)", 300), "![300](wide.png)");
  assert.equal(withWidth("![316](wide.png)", undefined), "![](wide.png)");
  assert.equal(withWidth("![alt](a.png)", 50), "![alt|50](a.png)");
  assert.equal(writtenWidth("![[pic.png|100x50]]"), 100);
  assert.equal(writtenHeight("![[pic.png|100x50]]"), 50);
  assert.equal(writtenWidth("![alt|25](a.png)"), 25);
  assert.equal(writtenHeight("![alt|25](a.png)"), undefined);
  assert.equal(writtenWidth("![[pic.png]]"), undefined);
});

test("Enter selects the file name; Tab selects the alias / size segment", () => {
  assert.deepEqual(targetRange("![[pic.png]]"), { from: 3, to: 10 });
  assert.deepEqual(targetRange("![[pic.png#x|20]]"), { from: 3, to: 10 });
  assert.deepEqual(targetRange("![alt](a.png)"), { from: 7, to: 12 });
  // Obsidian editSelectedImageAlias (REA): wiki pipe body, or MD alt.
  assert.deepEqual(aliasRange("![[pic.png]]"), { from: 10, to: 10 });
  assert.deepEqual(aliasRange("![[pic.png|100]]"), { from: 11, to: 14 });
  assert.deepEqual(aliasRange("![[pic.png#x|20]]"), { from: 13, to: 15 });
  assert.deepEqual(aliasRange("![[pic.png|alt|50]]"), { from: 11, to: 17 });
  assert.deepEqual(aliasRange("![alt](a.png)"), { from: 2, to: 5 });
  assert.deepEqual(aliasRange("![alt|50](a.png)"), { from: 2, to: 8 });
  assert.deepEqual(aliasRange("![](a.png)"), { from: 2, to: 2 });
});

test("an image embed has no Edit button; a note embed reveals on a click", async () => {
  const { embedEditing, embedsImage } =
    await import("../../../src/plugins/embeds/clicks");
  assert.equal(embedsImage("![[pic.png]]"), true);
  assert.equal(embedsImage("![alt](a.JPG)"), true);
  assert.equal(embedsImage("![[Note]]"), false);
  assert.equal(embedsImage("![[doc.pdf]]"), false);
  assert.deepEqual(embedEditing("![[pic.png|100]]"), { reveal: "none" });
  assert.deepEqual(embedEditing("![[Note]]"), { reveal: "click" });
  assert.deepEqual(embedEditing("![[doc.pdf]]"), { reveal: "button" });
});
