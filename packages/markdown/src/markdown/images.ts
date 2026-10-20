/** What an embed or Markdown image shows: its target, without size or heading. */
function embedTarget(source: string): string {
  return (
    /^!\[\[([^\]|#^]*)/u.exec(source)?.[1] ??
    /^!\[[^\]]*\]\(\s*<?([^)>\s]*)/u.exec(source)?.[1] ??
    ""
  ).trim();
}

const IMAGE = /\.(?:bmp|png|jpe?g|gif|svg|webp|avif)$/iu;

/**
 * Whether an embed (`![[a.png]]`) or Markdown image (`![](a.png)`) shows an
 * image file, which Obsidian 1.13 keeps rendered whatever the caret does.
 */
export function embedsImage(source: string): boolean {
  const target = embedTarget(source);
  // Pasted / inspector data URLs have no file extension but stay rendered
  // like image files (Obsidian 1.13 keeps the caret from revealing them).
  return IMAGE.test(target) || /^data:image\//i.test(target);
}
