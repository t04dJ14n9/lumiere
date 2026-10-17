import test from "node:test";
import assert from "node:assert/strict";
import {
  continuationPrefix,
  isEmptyQuote,
  lineMarkup,
  outerQuotes,
  textStart,
} from "../../../src/markdown/list-markup";

test("a line's markup: quotes, list marker and task box", () => {
  assert.deepEqual(lineMarkup("> - [ ] a"), {
    quotes: "> ",
    marker: "- ",
    task: "[ ] ",
  });
  assert.deepEqual(lineMarkup("\t1. a"), {
    quotes: "\t",
    marker: "1. ",
    task: "",
  });
  assert.deepEqual(lineMarkup("-a"), { quotes: "", marker: "", task: "" });
  assert.deepEqual(lineMarkup("## a"), { quotes: "", marker: "", task: "" });
});

test("the text starts after the markup", () => {
  assert.equal(textStart("- abc"), 2);
  assert.equal(textStart("- [ ] abc"), 6);
  assert.equal(textStart("> - abc"), 4);
  assert.equal(textStart("1. abc"), 3);
  assert.equal(textStart("abc"), 0);
});

test("a continuation lines up with the text, keeping quotes", () => {
  assert.equal(continuationPrefix("- a"), "  ");
  assert.equal(continuationPrefix("1. a"), "   ");
  assert.equal(continuationPrefix("- [ ] a"), "      ");
  assert.equal(continuationPrefix("\t- a"), "\t  ");
  assert.equal(continuationPrefix("> a"), "> ");
  assert.equal(continuationPrefix("  b"), "  ");
  assert.equal(continuationPrefix("a"), "");
});

test("empty quoted lines and one level out", () => {
  assert.equal(isEmptyQuote("> "), true);
  assert.equal(isEmptyQuote(">"), true);
  assert.equal(isEmptyQuote("> a"), false);
  assert.equal(isEmptyQuote("> - "), false);
  assert.equal(outerQuotes("> > "), "> ");
  assert.equal(outerQuotes("> "), "");
});
