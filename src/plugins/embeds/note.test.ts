import test from "node:test";
import assert from "node:assert/strict";
import { embeddedNote } from "./note";
test("note transclusion retains full-document line offsets and detects cycles and missing sections", () => {
  const text = "# First\n\nbody\n\n# Second\n- [ ] task\n";
  const section = embeddedNote(text, "file:///vault/A.md", "A#Second", []);
  assert.equal(section.sourceLine, 4);
  assert.equal(section.text, "# Second\n- [ ] task\n");
  assert.throws(() =>
    embeddedNote(text, "file:///vault/A.md", "A#Second", section.ancestry),
  );
  assert.throws(() =>
    embeddedNote(text, "file:///vault/A.md", "A#missing", []),
  );
  assert.throws(() =>
    embeddedNote(text, "file:///vault/A.md", "A", Array(12).fill("other")),
  );
});
