/**
 * The canvas's own undo history, apart from the note's: each change (a
 * stroke drawn, strokes erased) replaces the list of strokes, and undo
 * steps back through the lists. Lists share their strokes, so keeping
 * every step costs one array each.
 */
import type { InkStroke } from "../format";

export class StrokeHistory {
  private readonly undoable: (readonly InkStroke[])[] = [];
  private readonly redoable: (readonly InkStroke[])[] = [];
  private current: readonly InkStroke[];

  constructor(private readonly initial: readonly InkStroke[]) {
    this.current = initial;
  }

  get strokes(): readonly InkStroke[] {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoable.length > 0;
  }

  get canRedo(): boolean {
    return this.redoable.length > 0;
  }

  /** Whether the strokes differ from those the canvas opened with. */
  get isChanged(): boolean {
    return this.current !== this.initial;
  }

  /** A new change; what was undone before it can no longer be redone. */
  apply(strokes: readonly InkStroke[]): void {
    this.undoable.push(this.current);
    this.redoable.length = 0;
    this.current = strokes;
  }

  undo(): boolean {
    const previous = this.undoable.pop();
    if (!previous) {
      return false;
    }
    this.redoable.push(this.current);
    this.current = previous;
    return true;
  }

  redo(): boolean {
    const next = this.redoable.pop();
    if (!next) {
      return false;
    }
    this.undoable.push(this.current);
    this.current = next;
    return true;
  }
}
