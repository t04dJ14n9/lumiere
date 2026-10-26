/**
 * Detect image bytes by signature and encode a data URL for card covers.
 */
const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, to));

const SIGNATURES: readonly [string, (bytes: Uint8Array) => boolean][] = [
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => ascii(b, 1, 4) === "PNG" && b[0] === 0x89],
  ["image/gif", (b) => ascii(b, 0, 4) === "GIF8"],
  [
    "image/webp",
    (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  ],
];

/** A data URL typed by the image's own signature, not the server's header. */
export function imageDataUrl(bytes: Uint8Array): string {
  const type = SIGNATURES.find(([, matches]) => matches(bytes))?.[0];
  if (!type) {
    throw new Error("Unrecognised image");
  }
  return `data:${type};base64,${base64(bytes)}`;
}

/** Standard base64, as `Buffer.toString("base64")` writes it, without Node. */
function base64(bytes: Uint8Array): string {
  let binary = "";
  // In chunks: spreading a whole cover image into one call can overflow the stack.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}
