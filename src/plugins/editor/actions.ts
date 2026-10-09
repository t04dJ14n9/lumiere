import { type Infer } from "../../kernel";
import type { Editors, Selections, SourceSelection } from "./api";
import type { Workbench } from "../../shared/runtime";
import {
  CancelToken,
  RpcError,
  type Cancellation,
} from "../../shared/rpc/lifecycle";
import type { EditorAction } from "./actions-api";
import { action } from "./actions-protocol";
interface Entry {
  owner: string;
  value: EditorAction;
}
/** Labels cross to the UI; callbacks and ownership remain in the host. */
export class ActionRegistry {
  private readonly entries = new Map<string, Entry>();
  private live = true;
  constructor(
    private readonly editors: Editors,
    private readonly selections: Selections,
    private readonly workbench: Workbench,
    private readonly changed: () => void,
  ) {}
  register(owner: string, value: EditorAction): () => void {
    if (!this.live) {
      throw new RpcError("PluginDisabled", "Editor actions stopped");
    }
    if (typeof value.run !== "function") {
      throw new RpcError(
        "InvalidArgument",
        "A contribution callback is required",
      );
    }
    const parsed = action.parse({
      owner,
      id: value.id,
      label: value.label,
      scope: value.scope,
    });
    const key = this.key(owner, parsed.id);
    if (this.entries.has(key)) {
      throw new RpcError("DuplicateContribution", "Duplicate editor action");
    }
    if (this.entries.size >= 1000) {
      throw new RpcError("InvalidArgument", "Too many editor actions");
    }
    const entry = { owner, value: { ...value, ...parsed } };
    this.entries.set(key, entry);
    this.changed();
    return () => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
        this.changed();
      }
    };
  }
  list(editorId?: string): Infer<typeof action>[] {
    return [...this.entries.values()]
      .filter(
        ({ value }) => !editorId || value.isAvailable?.(editorId) !== false,
      )
      .map(({ owner, value }) => ({
        owner,
        id: value.id,
        label: value.label,
        scope: value.scope,
      }))
      .sort(
        (a, b) => a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id),
      );
  }
  async run(
    editorId: string,
    owner: string,
    id: string,
    token: Cancellation,
  ): Promise<boolean> {
    const entry = this.entries.get(this.key(owner, id));
    const panel = this.editors.all().find((panel) => panel.id === editorId);
    if (
      !this.live ||
      !entry ||
      !panel ||
      entry.value.isAvailable?.(editorId) === false
    ) {
      return false;
    }
    await panel.session.flush();
    let selection: SourceSelection | undefined;
    if (entry.value.scope === "selection") {
      selection = await this.selections.capture(editorId, token);
      if (!selection) {
        return false;
      }
    }
    if (
      token.cancelled ||
      entry.value.isAvailable?.(editorId) === false ||
      !this.live ||
      this.entries.get(this.key(owner, id)) !== entry ||
      !this.editors.all().includes(panel)
    ) {
      throw new RpcError("Cancelled", "Editor action cancelled");
    }
    await entry.value.run({ editorId, ...(selection && { selection }) }, token);
    return true;
  }
  async pick(scope: EditorAction["scope"]): Promise<boolean> {
    const panel = this.editors.active();
    const views = this.workbench.views;
    if (!panel || !views) {
      return false;
    }
    const items = this.list(panel.id)
      .filter((action) => action.scope === scope)
      .map((value) => ({
        label: value.label,
        description: value.owner,
        value,
      }));
    const picked = await views.pick({
      placeholder: scope === "selection" ? "Selection actions" : "Note actions",
      items: (query) =>
        items.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        ),
    });
    if (!picked?.item) {
      return false;
    }
    const { owner, id } = picked.item.value;
    return this.run(panel.id, owner, id, new CancelToken());
  }
  clearOwner(owner: string): void {
    if (!this.live) {
      return;
    }
    for (const [key, entry] of this.entries) {
      if (entry.owner === owner) {
        this.entries.delete(key);
      }
    }
    this.changed();
  }
  dispose(): void {
    this.live = false;
    this.entries.clear();
  }
  private key(owner: string, id: string): string {
    return JSON.stringify([owner, id]);
  }
}
