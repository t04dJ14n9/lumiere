/**
 * A map that keeps at most `limit` entries, dropping the least recently used
 * (read or written) first. `onEvict` hears each entry dropped to make room.
 */
export class RecentlyUsed<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(
    private readonly limit: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** The value, now the most recently used. */
  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const [oldest, dropped] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.onEvict?.(oldest, dropped);
    }
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  values(): IterableIterator<V> {
    return this.entries.values();
  }
}
