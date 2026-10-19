export const mediaExtensions = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
  audio: ["mp3", "wav", "m4a", "ogg", "flac", "aac", "aif", "aiff"],
  video: ["mp4", "webm", "ogv", "mov", "mkv"],
} as const;
export type MediaKind = keyof typeof mediaExtensions;
export function mediaKind(path: string): MediaKind | undefined {
  const extension = path.split(/[?#]/)[0]!.split(".").at(-1)?.toLowerCase();
  return (Object.keys(mediaExtensions) as MediaKind[]).find((kind) =>
    (mediaExtensions[kind] as readonly string[]).includes(extension ?? ""),
  );
}
