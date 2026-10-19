/**
 * Live resources by owner (a plugin name, or "root") and kind ("effect",
 * "listener", "plugin", "service", or a kind passed to `acquire`). Every
 * acquisition adds one and every release removes one, so a plugin that
 * stopped cleanly owns nothing: leak tests compare snapshots of this ledger.
 * A cleanup that throws leaves a `failed <kind>` entry behind, so a failed
 * teardown never looks clean.
 */
export class ResourceLedger {
  private readonly counts = new Map<string, number>();

  add(owner: string, kind: string): void {
    const key = ledgerKey(owner, kind);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  remove(owner: string, kind: string): void {
    const key = ledgerKey(owner, kind);
    const count = (this.counts.get(key) ?? 0) - 1;
    if (count < 0) {
      throw new Error(`Released an untracked ${kind} of ${owner}`);
    }
    if (count === 0) {
      this.counts.delete(key);
    } else {
      this.counts.set(key, count);
    }
  }

  /** Owners with at least one live resource, and their counts by kind. */
  snapshot(): Record<string, Record<string, number>> {
    const owners: Record<string, Record<string, number>> = {};
    for (const [key, count] of this.counts) {
      const [owner, kind] = key.split("\u0000") as [string, string];
      (owners[owner] ??= {})[kind] = count;
    }
    return owners;
  }
}

function ledgerKey(owner: string, kind: string): string {
  return `${owner}\u0000${kind}`;
}
