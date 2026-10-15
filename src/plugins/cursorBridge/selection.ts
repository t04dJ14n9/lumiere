import type { Editors, Selections, SourceSelection } from "../editor/api";

/** Active MW panel selection, or undefined when empty / no panel. */
export async function captureActiveSelection(
  editors: Editors,
  selections: Selections,
): Promise<
  { panelId: string; uri: string; selection: SourceSelection } | undefined
> {
  const panel = editors.active();
  if (!panel) {
    return undefined;
  }
  const selection = await selections.capture(panel.id);
  if (!selection) {
    return undefined;
  }
  return { panelId: panel.id, uri: panel.document.uri, selection };
}
