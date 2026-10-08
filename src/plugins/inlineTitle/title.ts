export function titleFromSource(source: string): string {
  try {
    const name = decodeURIComponent(
      new URL(source).pathname.split("/").at(-1) ?? "",
    );
    return name.replace(/\.(md|markdown)$/i, "") || "Untitled";
  } catch {
    return "Untitled";
  }
}

/** The title is a filename component, never an arbitrary path from the webview. */
export function renameTarget(source: string, title: string): string {
  const normalized = title.trim();
  if (
    !normalized ||
    normalized.length > 255 ||
    /[\\/:\r\n\0]/.test(normalized) ||
    [".", ".."].includes(normalized)
  ) {
    throw new Error(
      "Use a file name of at most 255 characters without path separators or line breaks.",
    );
  }
  const uri = new URL(source);
  if (uri.protocol !== "file:") {
    throw new Error("Save the note before renaming it.");
  }
  const extension = /\.(md|markdown)$/i.exec(
    decodeURIComponent(uri.pathname),
  )?.[0];
  if (!extension) {
    throw new Error("Only Markdown notes can be renamed.");
  }
  uri.pathname =
    uri.pathname.slice(0, uri.pathname.lastIndexOf("/") + 1) +
    encodeURIComponent(normalized + extension);
  return uri.href;
}
