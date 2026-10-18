import assert from "node:assert/strict";
import { test } from "node:test";
import { agentText } from "../../src/shared/agent-text";
import {
  extractPdfLink,
  formatLocationFragment,
  parseLocationFragment,
  parsePdfLocation,
  pdfLink,
} from "../../src/shared/pdf-location";

test("locations round-trip through RFC 8118 link fragments", () => {
  const location = {
    page: 3,
    viewRect: { left: 72, top: 83.04, width: 134.12, height: 21 },
  };
  assert.equal(
    formatLocationFragment(location),
    "page=3&viewrect=72,83,134.1,21",
  );
  assert.equal(
    pdfLink("papers/my paper.pdf", { page: 2 }),
    "papers/my paper.pdf#page=2",
  );
  assert.deepEqual(parseLocationFragment("#page=3&viewrect=72,83,134,21"), {
    page: 3,
    viewRect: { left: 72, top: 83, width: 134, height: 21 },
  });
  // Other writers percent-encode the commas; unknown parameters are ignored.
  assert.deepEqual(
    parseLocationFragment("zoom=200&page=3&viewrect=72%2C83%2C134%2C21"),
    parseLocationFragment("page=3&viewrect=72,83,134,21"),
  );
});

test("an invalid page rejects the fragment and an invalid box is dropped", () => {
  for (const fragment of ["", "page=0", "page=2.5", "L12"]) {
    assert.equal(parseLocationFragment(fragment), undefined);
  }
  assert.deepEqual(parseLocationFragment("page=2&viewrect=1,2,0,4"), {
    page: 2,
  });
  assert.deepEqual(parseLocationFragment("page=2&viewrect=1,2,3"), { page: 2 });
});

test("malformed percent escapes cannot throw or hide the last invalid value", () => {
  for (const value of ["%", "%2", "%GG", "%E0%A4%A"]) {
    assert.equal(parseLocationFragment(`page=${value}`), undefined);
    assert.equal(parseLocationFragment(`page=2&page=${value}`), undefined);
    assert.deepEqual(parseLocationFragment(`page=2&viewrect=${value}`), {
      page: 2,
    });
    assert.deepEqual(
      parseLocationFragment(`page=2&viewrect=1,2,3,4&viewrect=${value}`),
      { page: 2 },
    );
    assert.deepEqual(parseLocationFragment(`page=2&unknown=${value}`), {
      page: 2,
    });
  }
});

test("command locations accept valid pages and sanitize valid boxes", () => {
  const rectangle = { left: 0, top: 2, width: 3, height: 4, extra: "ignored" };
  const result = parsePdfLocation({
    page: 2,
    viewRect: rectangle,
    extra: "ignored",
  });
  assert.deepEqual(result, {
    page: 2,
    viewRect: { left: 0, top: 2, width: 3, height: 4 },
  });
  assert.notEqual(result?.viewRect, rectangle);
  assert.deepEqual(parsePdfLocation({ page: 2 }), { page: 2 });
  assert.deepEqual(parsePdfLocation("#page=2&viewrect=0,2,3,4"), result);
  for (const value of [
    undefined,
    null,
    [],
    true,
    2,
    {},
    { page: "2" },
    { page: 0 },
    { page: -1 },
    { page: 2.5 },
    { page: Infinity },
    { page: NaN },
    { page: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.equal(parsePdfLocation(value), undefined);
  }
});

test("invalid command boxes are dropped without losing a valid page", () => {
  for (const viewRect of [
    undefined,
    null,
    true,
    "1,2,3,4",
    [],
    [1, 2, 3, 4],
    {},
    { left: "1", top: 2, width: 3, height: 4 },
    { left: -1, top: 2, width: 3, height: 4 },
    { left: 1, top: -2, width: 3, height: 4 },
    { left: 1, top: 2, width: 0, height: 4 },
    { left: 1, top: 2, width: 3, height: -4 },
    { left: 1, top: 2, width: NaN, height: 4 },
    { left: 1, top: 2, width: 3, height: Infinity },
    { left: Number.MAX_VALUE, top: 2, width: Number.MAX_VALUE, height: 4 },
  ]) {
    assert.deepEqual(parsePdfLocation({ page: 2, viewRect }), { page: 2 });
  }
  for (const box of [",2,3,4", "1, ,3,4", "1,2,3,", "1e308,2,1e308,4"]) {
    assert.deepEqual(parseLocationFragment(`page=2&viewrect=${box}`), {
      page: 2,
    });
  }
});

test("a pasted link is found in a Copy Link for Agent source line or a Markdown link", () => {
  const link = "papers/my paper.pdf#page=3&viewrect=72,83,134,21";
  const copied = agentText(
    {
      kind: "text",
      text: "x",
      pages: [{ page: 3, rects: [[72, 83, 206, 104]] }],
    },
    { path: "papers/my paper.pdf" },
  );
  for (const text of [
    link,
    ` <${link}> `,
    `[papers/my paper.pdf (page 3)](<${link}>)`,
    `Source: [papers/my paper.pdf (page 3)](<${link}>)`,
    `Source: ${link}`,
    copied,
  ]) {
    assert.equal(extractPdfLink(text), link, text);
  }
  assert.equal(
    extractPdfLink("[paper](papers/paper.pdf#page=2)"),
    "papers/paper.pdf#page=2",
  );
  assert.equal(
    extractPdfLink("file:///tmp/a.pdf#page=1"),
    "file:///tmp/a.pdf#page=1",
  );
});
