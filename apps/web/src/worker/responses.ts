/** The worker's responses to the routes it answers (shared/routes.ts). */
import type { Answer } from "../shared/messages";
import { mediaType } from "./media-types";

/** A note's page. Its content security policy is its first tag (note-pages.ts). */
export function pageResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Nothing here: no window of the app has it. */
export function notFound(): Response {
  return new Response(null, { status: 404 });
}

export interface FileRequest {
  /** The file's `file:` URI, for its media type. */
  readonly uri: string;
  /** The request's `Range` header. */
  readonly range: string | null;
}

/** The windows' answer to a file a note shows, as a response. */
export function vaultFileResponse(
  answer: Answer | undefined,
  request: FileRequest,
): Response {
  if (answer?.kind === "file") {
    return fileResponse(answer.file, request);
  }
  if (answer?.kind === "refused") {
    return new Response(null, { status: 403 });
  }
  return notFound();
}

/**
 * A file, whole or the one byte range asked for: a video asks for ranges,
 * and WebKit plays none without them. A range past the end is 416; several
 * ranges, or a header that does not parse, get the whole file, as HTTP
 * allows a server to.
 */
function fileResponse(file: Blob, request: FileRequest): Response {
  const size = file.size;
  const headers = fileHeaders(mediaType(request.uri));
  const range = byteRange(request.range, size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${size}` },
    });
  }
  if (!range) {
    return new Response(file, {
      headers: { ...headers, "content-length": String(size) },
    });
  }
  const { start, end } = range;
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
    },
  });
}

function fileHeaders(type: string): Record<string, string> {
  return {
    "content-type": type,
    "accept-ranges": "bytes",
    // The editor adds the file's mtime to its URL, so a changed file reloads.
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    // An SVG opened as a page of its own would run its scripts on the app's
    // origin, next to the reader's vaults; as an image it runs none.
    ...(type === "image/svg+xml"
      ? { "content-security-policy": "default-src 'none'; sandbox" }
      : {}),
  };
}

/** Bytes `start` to `end` of a file, both included. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** The one byte range `header` asks for in a file of `size` bytes; undefined for all of it. */
export function byteRange(
  header: string | null,
  size: number,
): ByteRange | "unsatisfiable" | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (!match[1] && !match[2])) {
    return undefined;
  }
  const [, first, last] = match;
  if (!first) {
    // The last `last` bytes.
    const length = Number(last);
    return length === 0 || size === 0
      ? "unsatisfiable"
      : { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last ? Number(last) : size - 1;
  if (start >= size || end < start) {
    return "unsatisfiable";
  }
  return { start, end: Math.min(end, size - 1) };
}
