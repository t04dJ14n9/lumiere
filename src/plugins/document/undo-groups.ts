interface Checkpoint {
  before: string;
  after: string;
  group?: string;
}
// Metadata over native undo steps, never an independent text/inverse-edit stack.
export class UndoGroups {
  private undo: Checkpoint[] = [];
  private redo: Checkpoint[] = [];
  clear(): void {
    this.undo = [];
    this.redo = [];
  }
  record(before: string, after: string, group?: string): void {
    if (before === after) {
      return;
    }
    this.undo.push({
      before,
      after,
      ...(group === undefined ? {} : { group }),
    });
    this.redo = [];
  }
  async run(
    action: "undo" | "redo",
    current: () => string,
    native: () => Promise<unknown>,
  ): Promise<void> {
    const from = action === "undo" ? this.undo : this.redo;
    const to = action === "undo" ? this.redo : this.undo;
    const first = from.at(-1);
    const group = first?.group;
    if (
      !first ||
      current() !== (action === "undo" ? first.after : first.before)
    ) {
      this.clear();
      await native();
      return;
    }
    do {
      const step = from.at(-1)!;
      if (current() !== (action === "undo" ? step.after : step.before)) {
        this.clear();
        return;
      }
      await native();
      if (current() !== (action === "undo" ? step.before : step.after)) {
        this.clear();
        return;
      }
      from.pop();
      to.push(step);
    } while (group !== undefined && from.at(-1)?.group === group);
  }
}
