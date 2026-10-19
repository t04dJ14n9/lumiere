import { isInsidePath } from "../../shared/workspace-path";
import type { ResolvedLayout } from "./api";

export interface NotePlace {
  readonly insideBundle: boolean;
  readonly collection?: string;
  readonly reserved: boolean;
}

export function notePlace(
  layout: ResolvedLayout,
  relativePath: string,
): NotePlace {
  const insideBundle = isInsidePath(layout.bundle, relativePath);
  const collection = insideBundle
    ? collectionOf(layout, relativePath)
    : undefined;
  return {
    insideBundle,
    ...(collection ? { collection } : {}),
    reserved: isReservedPage(layout, relativePath),
  };
}

/** Physical folder for a logical collection. Layout dirs win; otherwise the logical name. */
export function collectionDirectory(
  layout: ResolvedLayout,
  logical: string,
): string {
  const physical = layout.dirs[logical] ?? logical;
  return `${layout.bundle}/${physical}`;
}

export function collectionOf(
  layout: ResolvedLayout,
  relativePath: string,
): string | undefined {
  const prefix = `${layout.bundle}/`;
  if (!relativePath.startsWith(prefix)) {
    return undefined;
  }
  const segment = relativePath.slice(prefix.length).split("/")[0];
  if (!segment) {
    return undefined;
  }
  for (const [logical, physical] of Object.entries(layout.dirs)) {
    if (physical === segment) {
      return `$${logical}`;
    }
  }
  return undefined;
}

function isReservedPage(layout: ResolvedLayout, relativePath: string): boolean {
  if (!isInsidePath(layout.bundle, relativePath)) {
    return false;
  }
  const rest = relativePath.slice(layout.bundle.length + 1);
  return rest === "index.md" || rest === "log.md" || rest.endsWith("/index.md");
}
