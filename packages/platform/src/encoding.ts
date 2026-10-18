/**
 * Byte encodings for code that runs both in Node and in the browser, where
 * there is no `Buffer`. They produce exactly what `Buffer` does
 * (test/encoding.test.ts pins them to it), decoding included: like
 * `Buffer.from(text, "base64")`, decoding accepts both alphabets, skips
 * characters outside them and stops at the first `=`.
 */

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Each ASCII code's 6-bit value in either alphabet, or -1. */
const SEXTETS = sextetTable();

function sextetTable(): Int8Array {
  const table = new Int8Array(128).fill(-1);
  for (let index = 0; index < 64; index++) {
    table[BASE64.charCodeAt(index)] = index;
    table[BASE64_URL.charCodeAt(index)] = index;
  }
  return table;
}

/** Base64 with padding, as `Buffer.toString("base64")`. */
export function bytesToBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes, BASE64, true);
}

/** URL-safe base64 without padding, as `Buffer.toString("base64url")`. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes, BASE64_URL, false);
}

function encodeBase64(
  bytes: Uint8Array,
  alphabet: string,
  padded: boolean,
): string {
  const codes: number[] = [];
  const symbol = (value: number) => codes.push(alphabet.charCodeAt(value));
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const triple =
      (bytes[index]! << 16) | (bytes[index + 1]! << 8) | bytes[index + 2]!;
    symbol(triple >> 18);
    symbol((triple >> 12) & 63);
    symbol((triple >> 6) & 63);
    symbol(triple & 63);
  }
  const rest = bytes.length - index;
  if (rest > 0) {
    const triple =
      (bytes[index]! << 16) | (rest === 2 ? bytes[index + 1]! << 8 : 0);
    symbol(triple >> 18);
    symbol((triple >> 12) & 63);
    if (rest === 2) {
      symbol((triple >> 6) & 63);
    }
    if (padded) {
      codes.push(...(rest === 1 ? [61, 61] : [61]));
    }
  }
  return fromCharCodes(codes);
}

/** The bytes of base64 or base64url text, as `Buffer.from(text, "base64")`. */
export function base64ToBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let pending = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 61) {
      break;
    }
    const value = code < 128 ? SEXTETS[code]! : -1;
    if (value < 0) {
      continue;
    }
    pending = ((pending << 6) | value) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((pending >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** Lowercase hexadecimal, as `Buffer.toString("hex")`. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Whether two strings are equal, taking the same time wherever they differ,
 * so a signature check does not reveal how much of a guess was right.
 * Strings of different lengths are unequal at once (as `timingSafeEqual`
 * refuses them).
 */
export function equalInConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** `String.fromCharCode` in chunks: one call with millions of arguments overflows the stack. */
function fromCharCodes(codes: readonly number[]): string {
  const chunk = 0x8000;
  let text = "";
  for (let start = 0; start < codes.length; start += chunk) {
    text += String.fromCharCode(...codes.slice(start, start + chunk));
  }
  return text;
}
