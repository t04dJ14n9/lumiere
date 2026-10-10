import type { PropertyEdit, PropertyValue } from "../../markdown/properties";
import type {
  PropertyKind,
  PropertyTypes,
} from "../../markdown/properties/types";
import type { MenuItem } from "../editor/api";
export type Action =
  | "save"
  | "undo"
  | "redo"
  | "close"
  | "saveClose"
  | "openAsText";
/** Internal sheet adapter. No cross-plugin capability callbacks live in render passes. */
export interface PropertyContext {
  source: string;
  copy(text: string): void;
  readClipboard?(): Promise<string>;
  openMenu(
    owner: HTMLElement,
    items: readonly MenuItem[],
    point: { x: number; y: number },
    report: (message: string) => void,
    label?: string,
  ): () => void;
  propertyEditor?: {
    source: string;
    currentSource?(): string;
    refresh?(): void;
    set(header: string, key: string, value: PropertyValue): boolean;
    edit?(header: string, operation: PropertyEdit): boolean;
    types?(): PropertyTypes;
    names?(): Promise<readonly string[]>;
    collapsed?(): boolean;
    setCollapsed?(collapsed: boolean): void;
    setType?(key: string, kind: PropertyKind | null): void;
    focusBody?(): void;
    focusTitle?(): void;
    pageHeading?(backward: boolean): void;
    action?(action: Action): void;
  };
}
