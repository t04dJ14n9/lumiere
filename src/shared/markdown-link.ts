import { baseName, encodeLinkPath, relativePosix } from "./workspace-path";

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

/** A portable Markdown link from a note to another project file. Never a wikilink. */
export function portableMarkdownLink(fromNote: string, target: string): string {
  const relative = encodeLinkPath(relativePosix(fromNote, target));
  const label = linkLabel(baseName(target));
  if (IMAGE.test(target)) {
    return `![${label}](${relative})`;
  }
  return `[${label}](${relative})`;
}

function linkLabel(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  return (stem || name).replaceAll("[", "").replaceAll("]", "");
}
