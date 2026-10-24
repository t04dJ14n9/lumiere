/** Files served as they are: the built editor, the page shim, a note's images. */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import * as path from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

/** A file under `base`, named by a URL path segment; 403 for anything outside it. */
export async function serveStatic(
  res: ServerResponse,
  base: string,
  relative: string,
): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const root = path.resolve(base);
  const file = path.resolve(root, decoded);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  await serveFile(res, file);
}

export async function serveFile(
  res: ServerResponse,
  file: string | URL,
): Promise<void> {
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  const name = typeof file === "string" ? file : file.pathname;
  res.writeHead(200, {
    "content-type":
      CONTENT_TYPES[path.extname(name).toLowerCase()] ??
      "application/octet-stream",
    "content-length": info.size,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
  });
  createReadStream(file).pipe(res);
}
