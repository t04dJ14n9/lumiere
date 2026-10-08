import type { PropertyScalar } from "../../markdown/properties";

export interface ChipActions {
  editable: boolean;
  values(): PropertyScalar[] | undefined;
  value(input: HTMLInputElement): string | undefined;
  update(values: PropertyScalar[], refocus: boolean): boolean;
  remove(index: number, previous?: boolean): void;
  refresh(): void;
  copy(text: string): void;
  action(action: "save" | "undo" | "redo"): void;
}
