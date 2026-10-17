import { pathToFileURL } from "node:url";

/** Interpret Windows paths independently of the extension host's platform. */
export function pathToFileUriString(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (/^[a-z]:\//i.test(normalized)) {
    return "file:///" + normalized[0] + ":" + encodePath(normalized.slice(2));
  }
  if (normalized.startsWith("//")) {
    const slash = normalized.indexOf("/", 2);
    const host = slash < 0 ? normalized.slice(2) : normalized.slice(2, slash);
    const path = slash < 0 ? "/" : normalized.slice(slash);
    return `file://${host}${encodePath(path)}`;
  }
  return pathToFileURL(filePath).href;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
