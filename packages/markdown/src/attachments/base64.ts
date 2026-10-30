/** Encode bytes as base64 without Node or DOM imports. */
export function encodeBase64(bytes: Uint8Array): string {
  const encode = (globalThis as { btoa?: (data: string) => string }).btoa;
  if (typeof encode === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return encode(binary);
  }
  const buffer = (
    globalThis as {
      Buffer?: { from(data: Uint8Array): { toString(enc: string): string } };
    }
  ).Buffer;
  if (!buffer) {
    throw new Error("No base64 encoder");
  }
  return buffer.from(bytes).toString("base64");
}

/** Decode base64 into bytes; undefined when the payload is invalid. */
export function decodeBase64(value: string): Uint8Array | undefined {
  try {
    const decode = (globalThis as { atob?: (data: string) => string }).atob;
    if (typeof decode === "function") {
      const binary = decode(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    const buffer = (
      globalThis as {
        Buffer?: { from(data: string, enc: string): Uint8Array };
      }
    ).Buffer;
    return buffer ? new Uint8Array(buffer.from(value, "base64")) : undefined;
  } catch {
    return undefined;
  }
}
