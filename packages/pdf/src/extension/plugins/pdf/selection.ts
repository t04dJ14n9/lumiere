import type { PdfSelection } from "../../../shared/selection";

/** A selection with the version of the file it was made in. */
export interface SelectionSnapshot {
  selection: PdfSelection;
  /** SHA-256 of the bytes the selection was made in. Not a hash of the selection. */
  sha256: string;
  /** When the user made this selection. A repeat of the same selection keeps it. */
  selectedAt: string;
  /** For a region: its PNG snapshot as a data URL, when the viewer rendered one. */
  image?: string;
}

/**
 * What the reader has selected in one editor.
 *
 * Invariant: a selection always belongs to the bytes currently loaded. A
 * reload clears it before the new bytes reach the viewer, so an agent can
 * never receive a selection paired with the hash of a different file.
 */
export class PdfSelectionState {
  private current: SelectionSnapshot | undefined;

  get selection(): PdfSelection | undefined {
    return this.current?.selection;
  }

  /** The selection with its file version, or `undefined` with nothing selected. */
  snapshot(): SelectionSnapshot | undefined {
    return this.current;
  }

  /**
   * The viewer reported a selection (or none) in the bytes hashed `sha256`.
   * `now` is the selection time. Repeating the same selection in the same
   * bytes keeps the earlier time; a new selection or a new file hash does not.
   */
  set(
    selection: PdfSelection | undefined,
    sha256: string | undefined,
    image?: string,
    now = new Date().toISOString(),
  ): void {
    if (!selection || !sha256) {
      this.current = undefined;
      return;
    }
    const previous = this.current;
    const selectedAt =
      previous !== undefined &&
      previous.sha256 === sha256 &&
      JSON.stringify(previous.selection) === JSON.stringify(selection)
        ? previous.selectedAt
        : now;
    this.current = {
      selection,
      sha256,
      selectedAt,
      ...(selection.kind === "region" && image ? { image } : {}),
    };
  }

  clear(): void {
    this.current = undefined;
  }
}
