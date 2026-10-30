/**
 * Load attachment bytes from a remote or file URL on the host (webview CSP
 * blocks connect-src https, so downloads cannot happen in the page).
 */

import { extensionForMime, extensionFromUrl } from "./html-images";

export interface SourceBytes {
  readonly bytes: Uint8Array;
  readonly ext: string;
}

export type SourceFetch = (
  url: string,
) => Promise<{
  ok: boolean;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export type SourceRead = (uri: string) => Promise<Uint8Array | undefined>;

/** True when the webview should ask the host to load this URL (not a data URI). */
export function isHostSourceUrl(url: string): boolean {
  return /^(https?:|file:)/i.test(url.trim());
}

/**
 * Download http(s) or read file:// into bytes + extension. Undefined on failure.
 */
export async function loadAttachmentSource(
  url: string,
  options: { fetch: SourceFetch; readFile: SourceRead },
): Promise<SourceBytes | undefined> {
  const trimmed = url.trim();
  if (!isHostSourceUrl(trimmed)) {
    return undefined;
  }
  try {
    if (/^file:/i.test(trimmed)) {
      const bytes = await options.readFile(trimmed);
      if (!bytes || bytes.length === 0) {
        return undefined;
      }
      return { bytes, ext: extensionFromUrl(trimmed) };
    }
    const response = await options.fetch(trimmed);
    if (!response.ok) {
      return undefined;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      return undefined;
    }
    const mime = response.headers.get("content-type") ?? "";
    const ext =
      extensionFromUrl(trimmed) ||
      (mime ? extensionForMime(mime.split(";")[0]!.trim()) : "png");
    return { bytes, ext };
  } catch {
    return undefined;
  }
}
