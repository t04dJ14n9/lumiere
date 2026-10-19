import { folderOf, nameOf } from "../../shared/vault-path";
import { isInsideBundle, isReservedNote } from "./paths";

export interface BundleFile {
  path: string;
  markdown: boolean;
  /** Non-empty frontmatter `type`, when the note has one. */
  type?: string;
}

/**
 * Bundle roots are folders that directly contain `index.md` and a typed
 * concept that is not claimed by a nested bundle, plus any manual roots.
 * A lone `index.md` is not a bundle.
 */
export function detectBundles(
  files: readonly BundleFile[],
  manual: readonly string[],
): string[] {
  const candidates = candidateRoots(files, manual);
  const manualRoots = new Set(manual.map(normalizeRoot).filter(isListedRoot));
  return candidates
    .filter((root) => isBundle(root, files, candidates, manualRoots))
    .sort((a, b) => (a < b ? -1 : 1));
}

function candidateRoots(
  files: readonly BundleFile[],
  manual: readonly string[],
): string[] {
  const roots = new Set<string>();
  for (const file of files) {
    if (file.markdown && nameOf(file.path).toLowerCase() === "index.md") {
      roots.add(folderOf(file.path));
    }
  }
  for (const root of manual) {
    const normalized = normalizeRoot(root);
    if (isListedRoot(normalized)) {
      roots.add(normalized);
    }
  }
  return [...roots];
}

function isBundle(
  root: string,
  files: readonly BundleFile[],
  candidates: readonly string[],
  manual: ReadonlySet<string>,
): boolean {
  if (manual.has(root)) {
    return true;
  }
  return files.some((file) => confirmsBundle(file, root, candidates));
}

function confirmsBundle(
  file: BundleFile,
  root: string,
  candidates: readonly string[],
): boolean {
  if (!file.markdown || !file.type?.trim() || isReservedNote(file.path)) {
    return false;
  }
  if (!isInsideBundle(file.path, root)) {
    return false;
  }
  return !candidates.some(
    (other) =>
      other !== root &&
      isInsideBundle(other, root) &&
      isInsideBundle(file.path, other),
  );
}

function normalizeRoot(root: string): string {
  return root.replace(/^\/+|\/+$/g, "");
}

function isListedRoot(root: string): boolean {
  return root !== "" && !root.split("/").includes("..");
}
