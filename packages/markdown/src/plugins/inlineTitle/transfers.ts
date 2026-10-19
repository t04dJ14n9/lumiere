import type { EditorPanel, ViewSnapshot } from "../editor/api";
import type { TitleFocus } from "./protocol";
export interface TitleTransfer {
  target: string;
  column?: number;
  snapshot: ViewSnapshot;
  focus?: TitleFocus;
}
/** Original panel identity owns a transfer; URI alone cannot distinguish split views. */
export class TitleTransfers {
  private readonly pending = new Map<string, TitleTransfer>();
  set(id: string, transfer: TitleTransfer): void {
    this.pending.set(id, transfer);
  }
  remove(ids: readonly string[]): void {
    for (const id of ids) {
      this.pending.delete(id);
    }
  }
  clear(): void {
    this.pending.clear();
  }
  take(
    panel: Pick<EditorPanel, "id" | "document" | "column">,
  ): TitleTransfer | undefined {
    const match = [...this.pending].find(
      ([id, value]) =>
        value.target === panel.document.uri &&
        (id === panel.id || value.column === panel.column),
    );
    if (!match) {
      return undefined;
    }
    this.pending.delete(match[0]);
    return match[1];
  }
}
