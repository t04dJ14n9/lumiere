import { SourceCoordinates } from "../../shared/document/coordinates";
import { RpcError, type Cancellation } from "../../shared/rpc/lifecycle";
import type { Workbench } from "../../shared/runtime";
import type { EditorPanel, SourceSelection } from "./api";
import { protocol } from "./protocol";
interface Captured {
  panel: EditorPanel;
  fingerprint: string;
}
/** Identity, not a caller-supplied ID, proves that a selection came from this host. */
export class SelectionSnapshots {
  private readonly captured = new WeakMap<SourceSelection, Captured>();
  private sequence = 0;
  constructor(
    private readonly panel: (id: string) => EditorPanel | undefined,
    private readonly workbench: Pick<Workbench, "fingerprint">,
  ) {}
  async capture(
    id: string,
    token?: Cancellation,
  ): Promise<SourceSelection | undefined> {
    const panel = this.panel(id);
    if (!panel) {
      throw new RpcError("EditorNotFound", "Editor not found");
    }
    return panel.session.withAction(async () => {
      await panel.session.flush();
      const version = panel.document.version;
      const range = await panel.rpc.call(
        protocol,
        "captureSelection",
        {},
        { token },
      );
      if (this.panel(id) !== panel) {
        throw new RpcError(
          "EditorNotFound",
          "The editor closed while capturing its selection",
        );
      }
      const coordinates = new SourceCoordinates(panel.document.getText());
      if (
        panel.document.version !== version ||
        range.version !== panel.session.version ||
        range.from > range.to ||
        range.to > coordinates.editor.length ||
        coordinates.editor.sliceString(range.from, range.to) !== range.text
      ) {
        throw new RpcError(
          "StaleSelection",
          "The document changed while capturing its selection",
        );
      }
      if (range.from === range.to) {
        return undefined;
      }
      const fingerprint = this.workbench.fingerprint(panel.document.getText());
      const snapshot = Object.freeze({
        id: `${id}:${++this.sequence}`,
        editorId: id,
        documentId: panel.document.id,
        version,
        isDirty: panel.document.isDirty,
        sourceSha256: panel.document.isDirty ? undefined : fingerprint,
        ...sourceRange(coordinates, range),
        text: range.text,
      });
      this.captured.set(snapshot, { panel, fingerprint });
      return snapshot;
    });
  }
  validate(selection: SourceSelection): EditorPanel {
    const captured = this.captured.get(selection);
    if (!captured) {
      throw new RpcError("InvalidArgument", "Unknown selection snapshot");
    }
    const panel = this.panel(selection.editorId);
    if (!panel || panel !== captured.panel) {
      throw new RpcError("EditorNotFound", "The selection's editor closed");
    }
    if (
      panel.document.version !== selection.version ||
      this.workbench.fingerprint(panel.document.getText()) !==
        captured.fingerprint
    ) {
      throw new RpcError("StaleSelection", "The selection's source changed");
    }
    return panel;
  }
}

function sourceRange(
  coordinates: SourceCoordinates,
  range: { from: number; to: number },
) {
  const start = coordinates.editor.lineAt(range.from);
  const end = coordinates.editor.lineAt(range.to);
  return {
    from: coordinates.toSource(range.from),
    to: coordinates.toSource(range.to),
    startLine: start.number,
    endLine: Math.max(
      start.number,
      end.number - (range.to === end.from ? 1 : 0),
    ),
  };
}
