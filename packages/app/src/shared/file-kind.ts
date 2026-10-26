/** What the window does with a vault file, by its name: open it, or list it greyed. */
export type FileKind = "note" | "pdf" | "image" | "other";

export function fileKind(path: string): FileKind {
  const extension = /\.[^./]*$/.exec(path)?.[0].toLowerCase() ?? "";
  if (extension === ".md" || extension === ".markdown") {
    return "note";
  }
  if (extension === ".pdf") {
    return "pdf";
  }
  return /^\.(png|jpe?g|gif|webp|svg|avif)$/.test(extension)
    ? "image"
    : "other";
}
