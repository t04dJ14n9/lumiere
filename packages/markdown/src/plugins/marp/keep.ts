const KEEP_KEY = "marp.keep";

export interface KeepStorage {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** Decks the user asked to keep in this editor. Stored per workspace. */
export function isKept(storage: KeepStorage | undefined, uri: string): boolean {
  return keptUris(storage).includes(uri);
}

export async function rememberDeck(
  storage: KeepStorage | undefined,
  uri: string,
): Promise<void> {
  const kept = keptUris(storage);
  if (!kept.includes(uri)) {
    kept.push(uri);
  }
  await storage?.update(KEEP_KEY, kept);
}

function keptUris(storage: KeepStorage | undefined): string[] {
  const current = storage?.get<unknown>(KEEP_KEY, []);
  if (!Array.isArray(current)) {
    return [];
  }
  return current.filter((item): item is string => typeof item === "string");
}
