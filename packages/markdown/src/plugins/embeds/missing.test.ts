import test from "node:test";
import assert from "node:assert/strict";
import { missingEmbedText } from "./post-process";

test("an embed that can't be found says so, naming its path", () => {
  assert.equal(
    missingEmbedText("attachments/missing.png"),
    '"attachments/missing.png" could not be found.',
  );
  assert.equal(
    missingEmbedText("gone.png|200"),
    '"gone.png" could not be found.',
  );
});

// Measured in a throwaway Obsidian vault (2026-10-17).
test("a missing heading or block in an existing note names the note, as Obsidian does", () => {
  assert.equal(
    missingEmbedText("#Local", { note: "probe", section: true }),
    "Unable to find “Local” in probe",
  );
  assert.equal(
    missingEmbedText("folder/Other#Missing|alias", {
      note: "probe",
      section: true,
    }),
    "Unable to find “Missing” in Other",
  );
  assert.equal(
    missingEmbedText("Gone#Heading"),
    '"Gone#Heading" could not be found.',
  );
});
