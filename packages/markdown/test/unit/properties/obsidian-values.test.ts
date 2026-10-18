import test from "node:test";
import assert from "node:assert/strict";
import { propertyInput } from "../../../src/markdown/properties/values";

// Measured in a throwaway Obsidian vault (2026-10-17).
test("a text property loses trailing spaces and keeps leading ones, as in Obsidian", () => {
  assert.equal(propertyInput("text", "trailing "), "trailing");
  assert.equal(propertyInput("text", "  lead"), "  lead");
  assert.equal(propertyInput("text", "mid  dle"), "mid  dle");
});
