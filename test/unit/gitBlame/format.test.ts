// test/unit/gitBlame/format.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatBlameGhost } from "../../../src/plugins/gitBlame/format";

const blame = {
  authorName: "Ada Lovelace",
  authorEmail: "ada@example.com",
  authorDate: 1_700_000_000,
  subject: "Clarify table rules and add a very long subject that must truncate",
};

test("You matching is case-insensitive on email", () => {
  const text = formatBlameGhost(
    blame,
    {
      userName: "Other",
      userEmail: "ADA@example.com",
    },
    1_700_000_000 + 120,
  );
  assert.match(text, /^You,/);
  assert.match(text, / • /);
  assert.ok(text.length < 80);
});

test("no identity → never You", () => {
  const text = formatBlameGhost(blame, undefined, 1_700_000_000 + 3600);
  assert.match(text, /^Ada Lovelace,/);
});

test("subject truncated ~48 with ellipsis", () => {
  const text = formatBlameGhost(blame, undefined, 1_700_000_000);
  const subject = text.split(" • ")[1] ?? "";
  assert.ok(subject.endsWith("…") || subject.endsWith("..."));
  assert.ok([...subject].length <= 50);
});

test("name match, empty identity and author fallbacks", () => {
  assert.match(
    formatBlameGhost(blame, { userName: blame.authorName }, blame.authorDate),
    /^You, just now/,
  );
  assert.match(
    formatBlameGhost({ ...blame, authorName: "" }, {}, blame.authorDate),
    /^ada,/,
  );
  assert.match(
    formatBlameGhost(
      { ...blame, authorName: "", authorEmail: "" },
      { userName: "", userEmail: "" },
      blame.authorDate,
    ),
    /^Unknown author,/,
  );
});

test("relative buckets, singular/plural and future timestamps", () => {
  for (const [elapsed, expected] of [
    [-1, "just now"],
    [59, "just now"],
    [60, "1 minute ago"],
    [120, "2 minutes ago"],
    [3600, "1 hour ago"],
    [86400, "1 day ago"],
    [604800, "1 week ago"],
    [2592000, "1 month ago"],
    [31536000, "1 year ago"],
    [63072000, "2 years ago"],
  ] as const) {
    assert.equal(
      formatBlameGhost(
        { ...blame, subject: "" },
        undefined,
        blame.authorDate + elapsed,
      ),
      `Ada Lovelace, ${expected}`,
    );
  }
});

test("subject uses only the first line and preserves complete Unicode graphemes", () => {
  assert.equal(
    formatBlameGhost(
      { ...blame, subject: "  Hello \nignored" },
      undefined,
      blame.authorDate,
    ),
    "Ada Lovelace, just now • Hello",
  );
  const grapheme = "👩🏽‍💻";
  const text = formatBlameGhost(
    { ...blame, subject: grapheme.repeat(60) },
    undefined,
    blame.authorDate,
  );
  assert.equal(text.split(" • ")[1], grapheme.repeat(48) + "…");
});
