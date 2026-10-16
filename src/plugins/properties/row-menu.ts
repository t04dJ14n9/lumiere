import {
  inferPropertyKind,
  propertyKindLabels,
  reservedPropertyKind,
} from "../../markdown/properties/types";
import type { MenuItem } from "../editor/api";
import type { PropertyContext } from "./context";
import type { PropertySelection } from "./selection";
import type { PropertyControlEdits, PropertyEditor } from "./control-edits";

export interface PropertyMenuState {
  closeMenu?: () => void;
}
interface RowMenuOptions {
  panel: HTMLElement;
  row: HTMLElement;
  key: string;
  editor: PropertyEditor;
  edits: Pick<PropertyControlEdits, "current" | "report">;
  selection: Pick<
    PropertySelection,
    "keys" | "copy" | "cut" | "paste" | "remove"
  >;
  state: PropertyMenuState;
  openMenu: PropertyContext["openMenu"];
  readClipboard: PropertyContext["readClipboard"];
}

export function bindRowMenu(options: RowMenuOptions): void {
  const type = options.row.querySelector<HTMLButtonElement>(
    "button[data-property-type]",
  )!;
  type.disabled = !options.editor?.setType;
  type.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = type.getBoundingClientRect();
    openRowMenu(options, { x: bounds.left, y: bounds.bottom });
  });
  options.row.addEventListener("contextmenu", (event) => {
    if (!options.editor?.edit) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openRowMenu(options, { x: event.clientX, y: event.clientY });
  });
}

function openRowMenu(
  options: RowMenuOptions,
  point: { x: number; y: number },
): void {
  const {
    panel,
    row,
    key,
    editor,
    edits,
    selection,
    state,
    openMenu,
    readClipboard,
  } = options;
  state.closeMenu?.();
  const keys = selection.keys(row);
  const choices = propertyTypeChoices(
    key,
    editor,
    edits.current()?.values?.[key],
  );
  state.closeMenu = openMenu(
    panel,
    propertyRowMenu({
      types: choices,
      multiple: keys.length > 1,
      copy: () => {
        if (!selection.copy(keys)) {
          throw new Error(
            "Could not copy properties. Try the keyboard copy shortcut.",
          );
        }
      },
      cut: () => {
        if (!selection.cut(keys)) {
          throw new Error(
            "Could not cut properties. Try the keyboard cut shortcut.",
          );
        }
      },
      paste: async () => {
        if (readClipboard) {
          selection.paste(await readClipboard());
        }
      },
      remove: () => selection.remove(keys),
    }),
    point,
    edits.report,
    "Property actions",
  );
}

export function propertyRowMenu(actions: {
  types: readonly MenuItem[];
  multiple: boolean;
  copy(): void;
  cut(): void;
  paste(): Promise<void>;
  remove(): void;
}): MenuItem[] {
  const items: MenuItem[] = actions.multiple
    ? []
    : [{ label: "Property type", children: actions.types }];
  return [
    ...items,
    { label: "Cut", run: () => actions.cut() },
    { label: "Copy", run: () => actions.copy() },
    { label: "Paste", run: () => actions.paste() },
    { label: "Remove", run: () => actions.remove() },
  ];
}

export function propertyTypeChoices(
  key: string,
  editor: PropertyEditor,
  value: unknown,
): MenuItem[] {
  const reserved = !!reservedPropertyKind(key);
  const preferences = editor?.types?.() ?? {};
  const registered = Object.hasOwn(preferences, key.toLowerCase());
  const current = inferPropertyKind(key, value, preferences);
  const automatic: MenuItem[] = reserved
    ? []
    : [
        {
          label: `Automatic (${propertyKindLabels[inferPropertyKind(key, value)]})`,
          checked: !registered,
          run: () => editor?.setType?.(key, null),
        },
      ];
  return [
    ...automatic,
    ...(
      ["checkbox", "date", "datetime", "list", "number", "text"] as const
    ).map((kind) => ({
      label: propertyKindLabels[kind],
      checked: (registered || reserved) && kind === current,
      disabled: reserved,
      run: () => editor?.setType?.(key, kind),
    })),
  ];
}
