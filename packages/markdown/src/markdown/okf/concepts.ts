import { stemOf } from "../../shared/vault-path";
import type { NoteMetadata } from "../metadata";

export type ConceptClass = "conformant" | "nonconformant" | "indexing";

/** Missing metadata is still indexing. A missing `type` is nonconformant, not omitted. */
export function conceptClass(metadata: NoteMetadata | undefined): ConceptClass {
  if (!metadata) {
    return "indexing";
  }
  const type = metadata.frontmatter?.type;
  return typeof type === "string" && type.trim()
    ? "conformant"
    : "nonconformant";
}

/** A non-empty string title, otherwise the filename. Objects are never labels. */
export function conceptTitle(
  path: string,
  frontmatter: Record<string, unknown> | undefined,
): string {
  const title = frontmatter?.title;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  return stemOf(path);
}

export function conceptDescription(
  frontmatter: Record<string, unknown> | undefined,
): string | undefined {
  const description = frontmatter?.description;
  if (typeof description === "string" && description.trim()) {
    return description.trim();
  }
  return undefined;
}

/** Frontmatter tags only. Inline tags are not mixed in unless a later slice says so. */
export function conceptTags(
  frontmatter: Record<string, unknown> | undefined,
): string[] {
  const tags = frontmatter?.tags;
  if (typeof tags === "string" && tags.trim()) {
    return [tags.trim()];
  }
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.flatMap((tag) =>
    typeof tag === "string" && tag.trim() ? [tag.trim()] : [],
  );
}

export function conceptType(
  frontmatter: Record<string, unknown> | undefined,
): string | undefined {
  const type = frontmatter?.type;
  return typeof type === "string" && type.trim() ? type.trim() : undefined;
}
