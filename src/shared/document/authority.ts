import { rebaseUpdates, type Update } from "@codemirror/collab";
import { ChangeSet, type Text } from "@codemirror/state";
import { difference, textDocument, type WireUpdate } from "./wire";

export interface Prepared {
  updates: readonly Update[];
  changes: ChangeSet;
  text: Text;
}

// A revision log for transport, not a second undo stack. VS Code owns history.
// Keep the log only while at least one view of this document is open.
export class Authority {
  doc: Text;
  private readonly history: Update[] = [];
  constructor(text: string) {
    this.doc = textDocument(text);
  }
  get version(): number {
    return this.history.length;
  }

  since(version: number): WireUpdate[] {
    this.validateVersion(version);
    return this.history.slice(version).map((update) => ({
      clientID: update.clientID,
      changes: update.changes.toJSON() as unknown[],
    }));
  }

  prepare(version: number, changes: unknown[], clientID: string): Prepared | undefined {
    this.validateVersion(version);
    let length = this.history[version]?.changes.length ?? this.doc.length;
    const received = changes.map((json) => {
      const change = ChangeSet.fromJSON(json);
      if (change.length !== length) {
        throw new Error("Edit does not match its document revision.");
      }
      length = change.newLength;
      return { clientID, changes: change };
    });
    const updates = rebaseUpdates(received, this.history.slice(version));
    if (!updates.length) {
      return undefined;
    } // A retried, already confirmed batch.
    let combined = ChangeSet.empty(this.doc.length);
    for (const update of updates) {
      combined = combined.compose(update.changes);
    }
    return { updates, changes: combined, text: combined.apply(this.doc) };
  }

  record(text: string, expected?: Prepared): void {
    const next = textDocument(text);
    if (expected && next.eq(expected.text)) {
      this.history.push(...expected.updates);
    } else if (!next.eq(this.doc)) {
      this.history.push({
        clientID: "host",
        changes: difference(this.doc.toString(), next.toString()),
      });
    }
    this.doc = next;
  }

  private validateVersion(version: number): void {
    if (!Number.isSafeInteger(version) || version < 0 || version > this.version) {
      throw new Error("Unknown document revision.");
    }
  }
}
