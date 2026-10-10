/**
 * The word each viewer last offered for Look Up (right-clicked), kept apart
 * from the panels so a closed viewer leaves nothing behind.
 */
export class LookUpTargets<Panel extends object> {
  private readonly words = new WeakMap<Panel, string>();

  /** Remember the word under the pointer in `panel`, or forget it with null. */
  record(panel: Panel, word: string | null): void {
    if (word === null) this.words.delete(panel);
    else this.words.set(panel, word);
  }

  word(panel: Panel | undefined): string | undefined {
    return panel ? this.words.get(panel) : undefined;
  }
}
