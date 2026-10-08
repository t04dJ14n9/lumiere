import {
  inferPropertyKind,
  propertyKinds,
  propertyKindLabels,
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
  selection: Pick<PropertySelection, "keys" | "copy" | "remove">;
  state: PropertyMenuState;
  openMenu: PropertyContext["openMenu"];
}

export function bindRowMenu(options: RowMenuOptions): void {
  const type = options.row.querySelector<HTMLButtonElement>(
    "[data-property-type]",
  )!;
  type.disabled = !options.editor?.setType;
  type.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = type.getBoundingClientRect();
    openRowMenu(options, { x: bounds.left, y: bounds.bottom }, true);
  });
  options.row.addEventListener("contextmenu", (event) => {
    if (!options.editor?.edit) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openRowMenu(options, { x: event.clientX, y: event.clientY }, false);
  });
}

function openRowMenu(
  options: RowMenuOptions,
  point: { x: number; y: number },
  typesOnly: boolean,
): void {
  const { panel, row, key, editor, edits, selection, state, openMenu } =
    options;
  state.closeMenu?.();
  const keys = selection.keys(row);
  const multiple = !typesOnly && keys.length > 1;
  const choices = typeChoices(key, editor, edits.current()?.values?.[key]);
  let items: MenuItem[] = [];
  if (typesOnly) {
    items = choices;
  } else if (!multiple) {
    items = [{ label: "Property type", children: choices }];
  }
  state.closeMenu = openMenu(
    panel,
    [
      ...items,
      {
        label: multiple ? "Copy properties" : "Copy property",
        run: () => {
          if (!selection.copy(multiple ? keys : [key])) {
            throw new Error(
              "Could not copy properties. Try the keyboard copy shortcut.",
            );
          }
        },
      },
      {
        label: multiple ? "Remove properties" : "Remove property",
        run: () => selection.remove(multiple ? keys : [key]),
      },
    ],
    point,
    edits.report,
    "Property actions",
  );
}

function typeChoices(
  key: string,
  editor: PropertyEditor,
  value: unknown,
): MenuItem[] {
  if (key.toLowerCase() === "tags") {
    return [{ label: "Tags", disabled: true }];
  }
  return [
    {
      label: `Automatic (${propertyKindLabels[inferPropertyKind(key, value)]})`,
      run: () => editor?.setType?.(key, null),
    },
    ...propertyKinds
      .filter((kind) => kind !== "tags")
      .map((kind) => ({
        label: propertyKindLabels[kind],
        run: () => editor?.setType?.(key, kind),
      })),
  ];
}
