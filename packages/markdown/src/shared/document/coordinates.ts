import { textDocument } from "./wire";

/** Maps LF-normalized editor positions to untouched source text and back. */
export class SourceCoordinates {
  readonly editor;
  private readonly starts = [0];

  constructor(readonly source: string) {
    this.editor = textDocument(source);
    for (const match of source.matchAll(/\r\n?|\n/g)) {
      this.starts.push(match.index + match[0].length);
    }
  }

  toSource(offset: number): number {
    const bounded = Math.max(0, Math.min(offset, this.editor.length));
    const line = this.editor.lineAt(bounded);
    return this.starts[line.number - 1]! + bounded - line.from;
  }

  toEditor(offset: number): number {
    const bounded = Math.max(0, Math.min(offset, this.source.length));
    let low = 0;
    let high = this.starts.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (this.starts[mid]! <= bounded) {
        low = mid;
      } else {
        high = mid;
      }
    }
    const line = this.editor.line(low + 1);
    return line.from + Math.min(bounded - this.starts[low]!, line.length);
  }
}
