import type { PreferenceStorage } from "./type-store";

/** One workspace disclosure setting applies to every note, including other vaults. */
export class PropertyCollapseStore {
  private pending: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(collapsed: boolean) => void>();
  private readonly key = "markdownPropertiesCollapsed";

  constructor(private readonly storage: PreferenceStorage) {}

  read(): boolean {
    return this.storage.get<unknown>(this.key, false) === true;
  }

  set(collapsed: boolean): Promise<void> {
    const update = this.pending.then(async () => {
      await this.storage.update(this.key, collapsed);
      for (const listener of this.listeners) {
        listener(collapsed);
      }
    });
    this.pending = update.catch(() => {});
    return update;
  }

  subscribe(listener: (collapsed: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
