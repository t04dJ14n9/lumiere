import test from "node:test";
import assert from "node:assert/strict";
import { languageLabel } from "./code-label";

test("fenced blocks are labelled with their language's name", () => {
  assert.equal(languageLabel("language-ts"), "TypeScript");
  assert.equal(languageLabel("hljs language-Python"), "Python");
  assert.equal(languageLabel("language-zig"), "zig");
  assert.equal(languageLabel(""), undefined);
});
