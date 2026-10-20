import { isInsideBundle } from "../../markdown/okf";
import { isMarkdownPath } from "../../shared/vault-path";
import type { Vault } from "../vault/api";
import type { GraphNote } from "./project";

/** Above this, the index is treated as partial. The vault's own limit stays private. */
export const PARTIAL_FILE_COUNT = 50_000;

export function indexCompleteness(
  fileCount: number,
  missingMetadata: boolean,
): "ready" | "partial" | "indexing" {
  if (fileCount >= PARTIAL_FILE_COUNT) {
    return "partial";
  }
  if (missingMetadata) {
    return "indexing";
  }
  return "ready";
}

/** Markdown files inside one bundle (`bundleRoot === ""` = whole vault), plus indexing completeness. */
export function collectBundle(
  vault: Vault,
  bundleRoot: string,
): { notes: GraphNote[]; completeness: "ready" | "partial" | "indexing" } {
  const files = vault.index.files();
  if (!Array.isArray(files)) {
    return { notes: [], completeness: "ready" };
  }
  const notes: GraphNote[] = [];
  let missingMetadata = false;
  for (const file of files) {
    if (!isMarkdownPath(file.path) || !isInsideBundle(file.path, bundleRoot)) {
      continue;
    }
    const metadata = vault.index.metadata(file.path);
    if (!metadata) {
      missingMetadata = true;
      notes.push({ path: file.path });
    } else {
      notes.push({ path: file.path, metadata });
    }
  }
  return {
    notes,
    completeness: indexCompleteness(files.length, missingMetadata),
  };
}
