import test from "node:test";
import assert from "node:assert/strict";
import {
  sizeOffset,
  steppedWidth,
  targetRange,
  withWidth,
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
  assert.equal(writtenWidth("![alt|25](a.png)"), 25);
  assert.equal(writtenWidth("![[pic.png]]"), undefined);
});

test("Enter selects the file name; Tab goes where the size is written", () => {
  assert.deepEqual(targetRange("![[pic.png]]"), { from: 3, to: 10 });
  assert.deepEqual(targetRange("![[pic.png#x|20]]"), { from: 3, to: 10 });
  assert.deepEqual(targetRange("![alt](a.png)"), { from: 7, to: 12 });
  assert.equal(sizeOffset("![[pic.png]]"), 10);
  assert.equal(sizeOffset("![alt](a.png)"), 5);
});
