import assert from "node:assert/strict";
import test from "node:test";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  equalInConstantTime,
} from "../src/encoding";

/** Deterministic bytes, so a failure reproduces. */
function bytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let index = 0; index < length; index++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[index] = state >> 16;
  }
  return out;
}

test("encodings match Buffer for every length near the padding boundaries", () => {
  for (let length = 0; length < 70; length++) {
    const data = bytes(length, length + 1);
    const buffer = Buffer.from(data);
    assert.equal(bytesToBase64(data), buffer.toString("base64"));
    assert.equal(bytesToBase64Url(data), buffer.toString("base64url"));
    assert.equal(bytesToHex(data), buffer.toString("hex"));
    assert.deepEqual(base64ToBytes(buffer.toString("base64")), data);
    assert.deepEqual(base64ToBytes(buffer.toString("base64url")), data);
  }
});

test("large inputs encode without overflowing the stack", () => {
  const data = bytes(3_000_001, 7);
  const encoded = bytesToBase64(data);
  assert.equal(encoded, Buffer.from(data).toString("base64"));
  assert.deepEqual(base64ToBytes(encoded), data);
});

test("decoding is as lenient as Buffer's", () => {
  const inputs = [
    "ab$cd",
    "YQ=Z",
    "YQ",
    "YQ==YQ==",
    "Y Q = =",
    "-_-_",
    "YWJj\nZGVm",
    "=YQ",
    "Y",
    "YW",
    "YWJ",
    "é YWJj",
    "",
  ];
  for (const input of inputs) {
    assert.deepEqual(
      base64ToBytes(input),
      Uint8Array.from(Buffer.from(input, "base64")),
      JSON.stringify(input),
    );
  }
});

test("constant-time equality is plain equality", () => {
  assert.equal(equalInConstantTime("", ""), true);
  assert.equal(equalInConstantTime("abc", "abc"), true);
  assert.equal(equalInConstantTime("abc", "abd"), false);
  assert.equal(equalInConstantTime("abc", "ab"), false);
});
