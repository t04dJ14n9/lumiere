const pending = new Map<string, Set<() => boolean>>();

function key(uri: string, column: number): string {
  return `${uri}\0${column}`;
}

/** Whether a native range is currently transferring into this custom panel. */
export function isNativeSelectionOpen(uri: string, column: number): boolean {
  return [...(pending.get(key(uri, column)) ?? [])].some((hasSelection) =>
    hasSelection(),
  );
}

/** Keep the native Search range's origin visible through the awaited openWith. */
export async function withNativeSelectionOpen<T>(
  uri: string,
  column: number,
  hasSelection: () => boolean,
  open: () => PromiseLike<T>,
): Promise<T> {
  const id = key(uri, column);
  const openings = pending.get(id) ?? new Set();
  openings.add(hasSelection);
  pending.set(id, openings);
  try {
    return await open();
  } finally {
    openings.delete(hasSelection);
    if (openings.size === 0) {
      pending.delete(id);
    }
  }
}
