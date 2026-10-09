import type { PreferenceStorage } from "./type-store";

/**
 * Whether a note's Properties are collapsed. As in Obsidian 1.14 it is kept
 * per note (collapsing one note leaves the others open, and a note keeps its
 * state when reopened); only collapsed notes are stored.
 */
export class PropertyCollapseStore {
  private pending: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<
    (note: string, collapsed: boolean) => void
  >();
  private readonly key = "markdownPropertiesCollapsedNotes";

  constructor(private readonly storage: PreferenceStorage) {}

  private notes(): Record<string, true> {
    const value = this.storage.get<unknown>(this.key, {});
    return typeof value === "object" && value !== null
      ? (value as Record<string, true>)
      : {};
  }

  read(note: string): boolean {
    return this.notes()[note] === true;
  }

  set(note: string, collapsed: boolean): Promise<void> {
    const update = this.pending.then(async () => {
      const rest = { ...this.notes() };
      delete rest[note];
      await this.storage.update(
        this.key,
        collapsed ? { ...rest, [note]: true } : rest,
      );
      for (const listener of this.listeners) {
        listener(note, collapsed);
      }
    });
    this.pending = update.catch(() => {});
    return update;
  }

  subscribe(listener: (note: string, collapsed: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
