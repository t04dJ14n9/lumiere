/**
 * Script nonces for webview pages, from the Web Crypto global that Node and
 * browsers both have, so a host without `node:crypto` can render pages.
 */

// The pure layer has no DOM or Node types; both runtimes define these.
declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
};
declare function btoa(data: string): string;

/** 24 random bytes in base64, the form `randomBytes(24).toString("base64")` gave. */
export function scriptNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes));
}
