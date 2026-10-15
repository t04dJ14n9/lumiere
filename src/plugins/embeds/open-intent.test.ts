import test from "node:test";
import assert from "node:assert/strict";
import { embedIsWiki } from "./post-process";

test("markdown images lack data-wiki; wiki embeds carry it", () => {
  assert.equal(embedIsWiki({ dataset: {} }), false);
  assert.equal(embedIsWiki({ dataset: { wiki: "" } }), false);
  assert.equal(embedIsWiki({ dataset: { wiki: "true" } }), true);
  assert.equal(embedIsWiki({ dataset: { wiki: "false" } }), false);
});
