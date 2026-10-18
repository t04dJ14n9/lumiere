import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "../encoding";
import type { Digests } from "../services";

const encoder = new TextEncoder();

/** SHA-256 in JavaScript (Web Crypto's digests are asynchronous; callers are not). */
export const webDigests: Digests = {
  sha256: (data) =>
    bytesToHex(sha256(typeof data === "string" ? encoder.encode(data) : data)),
  hmacSha256: (key, data) =>
    bytesToHex(hmac(sha256, key, encoder.encode(data))),
};
