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
