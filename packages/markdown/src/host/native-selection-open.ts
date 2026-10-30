const pending = new Map<string, Set<() => NativeOpenRange | undefined>>();

export interface NativeOpenRange {
  at: number;
  to?: number;
}

function key(uri: string, column: number): string {
  return `${uri}\0${column}`;
}

/** A Search match has both ends. A caret, including one at offset 0, does not. */
export function isNativeSelectionOpen(uri: string, column: number): boolean {
  return [...(pending.get(key(uri, column)) ?? [])].some((read) => {
    const range = read();
    return range?.to !== undefined && range.at !== undefined;
  });
}

/**
 * The range being transferred into this custom panel, while its open is in
 * flight. Captured onto the panel at resolve: the webview's ready call can
 * land after this open returns.
 */
export function nativeOpeningSelection(
  uri: string,
  column: number,
): { anchor: number; head: number } | undefined {
  for (const read of pending.get(key(uri, column)) ?? []) {
    const range = read();
    if (range?.to !== undefined && range.to > range.at) {
      return { anchor: range.at, head: range.to };
    }
  }
  return undefined;
}

export function openRange(request: {
  at: number | undefined;
  to: number | undefined;
}): NativeOpenRange | undefined {
  if (request.at === undefined) {
    return undefined;
  }
  if (request.to === undefined) {
    return { at: request.at };
  }
  return { at: request.at, to: request.to };
}

/** Keep the native Search range's origin visible through the awaited openWith. */
export async function withNativeSelectionOpen<T>(
  uri: string,
  column: number,
  range: () => NativeOpenRange | undefined,
  open: () => PromiseLike<T>,
): Promise<T> {
  const id = key(uri, column);
  const openings = pending.get(id) ?? new Set();
  openings.add(range);
  pending.set(id, openings);
  try {
    return await open();
  } finally {
    openings.delete(range);
    if (openings.size === 0) {
      pending.delete(id);
    }
  }
}
