/**
 * The media type of a file a note shows, by its extension: the images,
 * audio and video the editor embeds (packages/markdown's media-kinds.ts),
 * and PDFs. Anything else is served as bytes, which a browser never runs.
 */
const TYPES: Readonly<Record<string, string>> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  aac: "audio/aac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm",
  pdf: "application/pdf",
};

/** The media type of the file at `uri`. */
export function mediaType(uri: string): string {
  const name = new URL(uri).pathname.split("/").at(-1) ?? "";
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return TYPES[extension] ?? "application/octet-stream";
}
