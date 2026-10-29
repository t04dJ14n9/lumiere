import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentFolder,
  sketchEmbed,
  sketchFileName,
  sketchInsertion,
  sketchStem,
} from "../../../src/plugins/sketch/placement";

test("sketches go where Obsidian's attachment folder setting says", () => {
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
    // Never outside the vault.
    ["../outside", ""],
    ["./../../..", ""],
  ] as const) {
    assert.equal(attachmentFolder(setting, note), folder, setting);
  }
  assert.equal(attachmentFolder(".", "Root note.md"), "");
  assert.equal(attachmentFolder("./sub", "Root note.md"), "sub");
});

test("a sketch is named by the minute it was drawn, and never takes a name", () => {
  const date = new Date(2026, 9, 22, 14, 3, 59);
  assert.equal(sketchStem(date), "2026-10-22 14.03");
  assert.equal(sketchFileName(date, []), "2026-10-22 14.03.sketch.svg");
  assert.equal(
    sketchFileName(date, ["2026-10-22 14.03.SKETCH.svg", "other.png"]),
    "2026-10-22 14.03 2.sketch.svg",
  );
  assert.equal(
    sketchFileName(date, [
      "2026-10-22 14.03.sketch.svg",
      "2026-10-22 14.03 2.sketch.svg",
    ]),
    "2026-10-22 14.03 3.sketch.svg",
  );
  assert.equal(sketchStem(new Date(2027, 0, 5, 9, 7)), "2027-01-05 09.07");
});

test("the embed follows the vault's link settings", () => {
  const link = {
    path: "Attachments/2026-10-22 14.03.sketch.svg",
    notePath: "Projects/Plan.md",
    useWikilinks: true,
    format: "shortest" as const,
    isNameUnique: true,
  };
  assert.equal(sketchEmbed(link), "![[2026-10-22 14.03.sketch.svg]]");
  assert.equal(
    sketchEmbed({ ...link, isNameUnique: false }),
    "![[Attachments/2026-10-22 14.03.sketch.svg]]",
  );
  assert.equal(
    sketchEmbed({ ...link, format: "absolute" }),
    "![[Attachments/2026-10-22 14.03.sketch.svg]]",
  );
  assert.equal(
    sketchEmbed({ ...link, format: "relative" }),
    "![[../Attachments/2026-10-22 14.03.sketch.svg]]",
  );
  assert.equal(
    sketchEmbed({ ...link, useWikilinks: false }),
    "![](2026-10-22%2014.03.sketch.svg)",
  );
  assert.equal(
    sketchEmbed({ ...link, useWikilinks: false, format: "absolute" }),
    "![](Attachments/2026-10-22%2014.03.sketch.svg)",
  );
});

function inserted(source: string, caret: number | undefined): string {
  const edit = sketchInsertion(source, caret, "![[s]]");
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
}

test("the embed is a paragraph of its own, so Live Preview shows it as a block", () => {
  // In a line of text: after that line.
  assert.equal(inserted("One\nTwo\n", 1), "One\n\n![[s]]\n\nTwo\n");
  assert.equal(inserted("One\n\nTwo", 2), "One\n\n![[s]]\n\nTwo");
  // On an empty line between paragraphs: there.
  assert.equal(inserted("One\n\nTwo", 4), "One\n\n![[s]]\n\nTwo");
  assert.equal(inserted("One\n\n\nTwo", 5), "One\n\n![[s]]\n\nTwo");
  // At the end.
  assert.equal(inserted("One", 3), "One\n\n![[s]]\n");
  assert.equal(inserted("One\n", 4), "One\n\n![[s]]\n");
  assert.equal(inserted("One\n", undefined), "One\n\n![[s]]\n");
  // An empty note.
  assert.equal(inserted("", 0), "![[s]]\n");
  // A caret out of range is the end.
  assert.equal(inserted("One", 99), "One\n\n![[s]]\n");
});

test("insertion offsets are the editor's, where line breaks are one character", () => {
  const source = "One\r\nTwo\r\n";
  const edit = sketchInsertion(source, 1, "![[s]]");
  assert.deepEqual(edit, { from: 3, to: 3, insert: "\n\n![[s]]\n" });
});
