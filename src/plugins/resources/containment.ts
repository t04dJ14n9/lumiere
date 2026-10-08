import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export function contains(root: string, uri: string): boolean {
  if (/%(?:2f|5c)/i.test(uri)) return false;
  const base = new URL(root),
    target = new URL(uri);
  if (base.protocol !== target.protocol || base.host !== target.host) return false;
  const a = decodeURIComponent(base.pathname).replace(/\/$/, ""),
    b = decodeURIComponent(target.pathname);
  const relative = path.posix.relative(a, b);
  return !relative.startsWith("../") && relative !== ".." && !path.posix.isAbsolute(relative);
}
export async function containedResource(
  root: string,
  uri: string,
  symbolicLink: boolean,
  inspect?: (uri: string) => Promise<{ symbolicLink: boolean }>,
): Promise<void> {
  if (!contains(root, uri)) throw new Error("Resource escapes the vault");
  if (new URL(uri).protocol === "file:") {
    const [base, target] = await Promise.all([
      realpath(fileURLToPath(root)),
      realpath(fileURLToPath(uri)),
    ]);
    const relative = path.relative(base, target);
    if (relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative))
      throw new Error("Resource symlink escapes the vault");
  } else {
    if (symbolicLink) throw new Error("Virtual symbolic links are not supported");
    if (inspect) {
      const target = new URL(uri),
        base = new URL(root);
      const parts = target.pathname
        .slice(base.pathname.replace(/\/$/, "").length)
        .split("/")
        .filter(Boolean);
      let current = base.pathname.replace(/\/$/, "");
      for (const part of parts) {
        current += "/" + part;
        const at = new URL(base);
        at.pathname = current;
        if ((await inspect(at.href)).symbolicLink)
          throw new Error("Virtual symbolic links are not supported");
      }
    }
  }
}
