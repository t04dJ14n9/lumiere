/** Historical images use revision bytes; local images keep webview resource URLs. */
export async function diffImageUrl(
  resource: string,
  access: {
    read(uri: string): Promise<Uint8Array>;
    localUrl(uri: string): string;
  },
): Promise<string> {
  const uri = new URL(resource);
  if (uri.protocol !== "git:") {
    return access.localUrl(resource);
  }
  const extension = uri.pathname.split(".").at(-1)?.toLowerCase();
  const mime = extension === "svg" ? "svg+xml" : extension;
  if (
    !["png", "jpg", "jpeg", "gif", "webp", "svg+xml", "avif"].includes(
      mime ?? "",
    )
  ) {
    throw new Error("Unsupported image format");
  }
  const bytes = await access.read(resource);
  return `data:image/${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function diffResourceRoots(
  dist: string,
  roots: readonly string[],
): string[] {
  return [...new Set([dist, ...roots])];
}
