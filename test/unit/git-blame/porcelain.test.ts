// test/unit/git-blame/porcelain.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  isZeroOid,
  parseBlamePorcelain,
} from "../../../src/shared/git-blame/porcelain";

test("isZeroOid: SHA-1 and SHA-256 all-zero only", () => {
  assert.equal(isZeroOid("0".repeat(40)), true);
  assert.equal(isZeroOid("0".repeat(64)), true);
  assert.equal(isZeroOid("a".repeat(40)), false);
  assert.equal(isZeroOid("0".repeat(39) + "1"), false);
});

test("parseBlamePorcelain: all-zero OID → uncommitted", () => {
  const stdout = `${"0".repeat(40)} 1 1 1\nauthor Local\nauthor-mail <dev@example.com>\nauthor-time 1700000000\nsummary WIP\n\tline\n`;
  assert.equal(parseBlamePorcelain(stdout, 1).status, "uncommitted");
});

test("parseBlamePorcelain: boundary + non-zero OID → ok (not uncommitted)", () => {
  const oid = "a".repeat(40);
  const stdout = `${oid} 1 1 1\nauthor Ada\nauthor-mail <ada@example.com>\nauthor-time 1600000000\nsummary Root commit\nboundary\n\tline\n`;
  const result = parseBlamePorcelain(stdout, 1);
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.blame.commit, oid);
    assert.equal(result.blame.boundary, true);
    assert.equal(result.blame.subject, "Root commit");
  }
});

test("parseBlamePorcelain: SHA-256-length non-zero OID → ok", () => {
  const oid = "b".repeat(64);
  const stdout = `${oid} 2 2 1\nauthor Bob\nauthor-mail <bob@example.com>\nauthor-time 1600000001\nsummary Later\n\tline\n`;
  const result = parseBlamePorcelain(stdout, 2);
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.blame.commit, oid);
    assert.equal(result.blame.shortCommit.length >= 7, true);
  }
});

test("malformed or incomplete porcelain is unavailable", () => {
  for (const stdout of [
    "",
    "not porcelain",
    "abcd 1 1 1\n",
    `${"a".repeat(40)} 1 1 1\nauthor Ada\n`,
  ]) {
    assert.equal(parseBlamePorcelain(stdout, 1).status, "unavailable");
  }
});
