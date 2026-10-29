import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { scriptNonce } from "../../../src/shared/nonce";

test("a script nonce is 24 random bytes in base64, as node:crypto wrote it", () => {
  const nonce = scriptNonce();
  assert.equal(nonce.length, randomBytes(24).toString("base64").length);
  assert.equal(Buffer.from(nonce, "base64").length, 24);
  assert.match(nonce, /^[A-Za-z0-9+/]{32}$/);
  assert.notEqual(scriptNonce(), nonce);
});
