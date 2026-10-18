import type { Editors, Selections } from "../editor/api";
import { SourceCoordinates } from "../../shared/document/coordinates";
import type { SelectionSnapshot } from "./handoff";

/** Active MW selection or caret, flushed and tied to this panel and version. */
export async function captureActiveSelection(
  editors: Editors,
  selections: Selections,
): Promise<
  { panelId: string; uri: string; selection: SelectionSnapshot } | undefined
> {
  const panel = editors.active();
  if (!panel) {
    return undefined;
  }
  let selection: SelectionSnapshot | undefined = await selections.capture(
    panel.id,
  );
  if (!selection) {
    const snapshot = await editors.capture(panel.id);
    const coordinates = new SourceCoordinates(panel.document.getText());
    const { anchor, head } = snapshot.state;
    if (
      editors.active() !== panel ||
      snapshot.documentUri !== panel.document.uri ||
      snapshot.documentVersion !== panel.document.version ||
      anchor !== head ||
      head > coordinates.editor.length
    ) {
      return undefined;
    }
    const at = coordinates.toSource(head);
    selection = {
      from: at,
      to: at,
      text: "",
      version: snapshot.documentVersion,
    };
  }
  return { panelId: panel.id, uri: panel.document.uri, selection };
}
