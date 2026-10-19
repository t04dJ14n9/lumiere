import { readFileSync } from "node:fs";

/** Lumière PDF's own contributions (packages/pdf/contributes.json). */
export function pdfContributes<T = Record<string, unknown>>(): T {
  return JSON.parse(
    readFileSync(new URL("../../../contributes.json", import.meta.url), "utf8"),
  ) as T;
}

/** The extension's package.json at the repository root: what ships. */
export function extensionManifest<T = Record<string, unknown>>(): T {
  return JSON.parse(
    readFileSync(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    ),
  ) as T;
}
