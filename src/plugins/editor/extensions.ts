import { Prec } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { Disposer } from "@workshop/core";

export type ExtensionSlot = "override" | "suggest" | "keymap" | "base";
const slots = { override: 0, suggest: 1, keymap: 2, base: 3 };
const wrap = {
  override: Prec.highest,
  suggest: Prec.high,
  keymap: Prec.default,
  base: Prec.low,
};
interface Entry {
  owner: string;
  slot: ExtensionSlot;
  extension: Extension;
  order: number;
}

/** One registry per editor. It owns ordering, not CodeMirror or the DOM. */
export class ExtensionRegistry {
  private readonly entries = new Set<Entry>();
  private sequence = 0;
  constructor(
    private readonly rank: (owner: string) => number,
    private readonly changed: (extensions: Extension) => void,
  ) {}
  ordered(): readonly Entry[] {
    return [...this.entries].sort(
      (a, b) =>
        slots[a.slot] - slots[b.slot] ||
        this.rank(a.owner) - this.rank(b.owner) ||
        compareOwners(a.owner, b.owner) ||
        a.order - b.order,
    );
  }
  private refresh(): void {
    this.changed(
      this.ordered().map((entry) => wrap[entry.slot](entry.extension)),
    );
  }
  register(
    owner: string,
    extension: Extension,
    slot: ExtensionSlot = "keymap",
  ): Disposer {
    const entry = { owner, extension, slot, order: this.sequence++ };
    this.entries.add(entry);
    this.refresh();
    return () => {
      if (this.entries.delete(entry)) {
        this.refresh();
      }
    };
  }
}

function compareOwners(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
