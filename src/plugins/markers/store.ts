import { Schema, type Infer } from "../../kernel";
import type { HostDocument, SourceEdit } from "../../shared/runtime";
import type { EditorPanel } from "../editor/api";
import { SourceCoordinates } from "../../shared/document/coordinates";
import { RpcError } from "../../shared/rpc/lifecycle";
import type { Markers, SourceMarker } from "./api";
import { marker, type snapshot } from "./protocol";
import { MarkerRevisions, mapMarker } from "./revisions";
type Action = Parameters<Markers["registerAction"]>[1];
export class MarkerStore {
  private readonly entries = new Map<string, Map<string, SourceMarker[]>>();
  private readonly histories = new Map<HostDocument, MarkerRevisions>();
  private readonly actions = new Map<string, Map<string, Action>>();
  private live = true;
  private readonly revisions = new Map<string, number>();
  constructor(
    private readonly panels: () => readonly EditorPanel[],
    private readonly publish: (
      panel: EditorPanel,
      value: Infer<typeof snapshot>,
    ) => void,
  ) {}
  observe(panel: EditorPanel): void {
    if (!this.histories.has(panel.document)) {
      this.histories.set(
        panel.document,
        new MarkerRevisions(panel.document.version, panel.document.getText()),
      );
    }
  }
  service(owner: string, isLive: () => boolean = () => true): Markers {
    const ensureLive = () => {
      if (!isLive()) {
        throw new RpcError("PluginDisabled", "Marker provider stopped");
      }
    };
    return {
      set: (id, markers) => {
        ensureLive();
        this.set(owner, id, markers);
      },
      clear: (id) => {
        ensureLive();
        this.entries.get(id)?.delete(owner);
        this.send(id);
      },
      registerAction: (id, run) => {
        ensureLive();
        return this.registerAction(owner, id, run);
      },
    };
  }
  private set(
    owner: string,
    id: string,
    values: readonly SourceMarker[],
  ): void {
    this.assertLive();
    const panel = this.panel(id);
    const parsed = Schema.array(marker).max(1000).parse(values);
    if (new Set(parsed.map((value) => value.id)).size !== parsed.length) {
      throw new RpcError("DuplicateContribution", "Duplicate marker ID");
    }
    this.observe(panel);
    const mapped = parsed.flatMap((value) => {
      const result = this.histories.get(panel.document)!.map(value);
      return result ? [result] : [];
    });
    const owners = this.entries.get(id) ?? new Map<string, SourceMarker[]>();
    owners.set(owner, mapped);
    this.entries.set(id, owners);
    this.send(id);
  }
  snapshot(id: string): Infer<typeof snapshot> {
    const panel = this.panel(id);
    const coordinates = new SourceCoordinates(panel.document.getText());
    return {
      version: panel.session.version,
      revision: this.revisions.get(id) ?? 0,
      owners: Object.fromEntries(
        [...(this.entries.get(id) ?? [])].map(([owner, values]) => [
          owner,
          values.map((value) => ({
            ...value,
            from: coordinates.toEditor(value.from),
            to: coordinates.toEditor(value.to),
          })),
        ]),
      ),
    };
  }
  changed(document: HostDocument, edits?: readonly SourceEdit[]): void {
    const history = this.histories.get(document);
    if (!history) {
      return;
    }
    const changes = history.update(document.version, document.getText(), edits);
    for (const panel of this.panels().filter(
      (panel) => panel.document === document,
    )) {
      for (const [owner, values] of this.entries.get(panel.id) ?? []) {
        this.entries.get(panel.id)!.set(
          owner,
          values.flatMap((value) => {
            const mapped = mapMarker(value, changes);
            return mapped
              ? [{ ...mapped, documentVersion: document.version }]
              : [];
          }),
        );
      }
      this.send(panel.id);
    }
  }
  clearOwner(owner: string): void {
    this.actions.delete(owner);
    for (const [id, owners] of this.entries) {
      if (owners.delete(owner)) {
        this.send(id);
      }
    }
  }
  closed(id: string): void {
    this.entries.delete(id);
    this.revisions.delete(id);
    for (const document of this.histories.keys()) {
      if (!this.panels().some((panel) => panel.document === document)) {
        this.histories.delete(document);
      }
    }
  }
  private registerAction(owner: string, id: string, run: Action): () => void {
    this.assertLive();
    Schema.string().min(1).max(256).parse(id);
    const actions = this.actions.get(owner) ?? new Map<string, Action>();
    if (actions.has(id)) {
      throw new RpcError("DuplicateContribution", "Duplicate marker action");
    }
    actions.set(id, run);
    this.actions.set(owner, actions);
    return () => {
      actions.delete(id);
    };
  }
  async activate(
    editorId: string,
    owner: string,
    id: string,
  ): Promise<boolean> {
    this.assertLive();
    this.panel(editorId);
    const value = this.entries
      .get(editorId)
      ?.get(owner)
      ?.find((value) => value.id === id);
    const action =
      value?.actionId && this.actions.get(owner)?.get(value.actionId);
    if (!value || !action) {
      return false;
    }
    await action({ editorId, marker: Object.freeze({ ...value }) });
    return true;
  }
  send(id: string): void {
    const panel = this.panels().find((panel) => panel.id === id);
    if (panel && this.live) {
      this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
      this.publish(panel, this.snapshot(id));
    }
  }
  dispose(): void {
    this.live = false;
    this.entries.clear();
    this.actions.clear();
    this.histories.clear();
    this.revisions.clear();
  }
  private assertLive(): void {
    if (!this.live) {
      throw new RpcError("PluginDisabled", "Markers are disabled");
    }
  }
  private panel(id: string): EditorPanel {
    const panel = this.panels().find((panel) => panel.id === id);
    if (!panel) {
      throw new RpcError("EditorNotFound", "Marker editor not found");
    }
    return panel;
  }
}
