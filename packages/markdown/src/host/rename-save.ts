import type { FileTextEdits } from "../shared/runtime";

/** Files a link update edits that had no unsaved changes of their own. */
export function cleanEditedUris(
  files: readonly FileTextEdits[],
  isDirty: (uri: string) => boolean,
): string[] {
  return files
    .filter((file) => file.edits.length > 0 && !isDirty(file.uri))
    .map((file) => file.uri);
}
