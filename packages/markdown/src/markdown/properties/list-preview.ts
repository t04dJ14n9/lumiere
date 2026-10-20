/** Default chips/rows shown before disclosure (`properties.listPreviewCount`). */
export const DEFAULT_LIST_PREVIEW_COUNT = 3;

/** Clamp a setting value to a sane preview window (1–50). */
export function listPreviewCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_LIST_PREVIEW_COUNT;
  }
  return Math.max(1, Math.min(50, Math.floor(n)));
}
