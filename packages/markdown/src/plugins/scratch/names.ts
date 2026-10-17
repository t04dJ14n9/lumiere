import { uniqueFileName } from "../../shared/file-name";
import { noteSlug } from "./template";

export function scratchFileName(
  title: string,
  at: string,
  existing: readonly string[],
): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : "note";
  return uniqueFileName(`${day}-${noteSlug(title)}.md`, existing);
}

export function promotedFileName(
  title: string,
  existing: readonly string[],
): string {
  return uniqueFileName(`${noteSlug(title)}.md`, existing);
}
