import type {
  RevealPanel,
  NavigationTarget,
  NavigationIntent,
  PanelShell,
} from "../shared/runtime";
import { CancelToken } from "../shared/rpc/lifecycle";
import type { Disposer } from "../kernel";

/** No URI mailbox: the native opener assigns one exact panel before delivery. */
export class RevealRouter {
  private readonly panels = new Map<string, RevealPanel>();
  private readonly changed = new Set<() => void>();
  private latest = 0;
  private token = new CancelToken();
  begin(): { requestId: number; token: CancelToken } {
    this.token.cancel();
    this.token = new CancelToken();
    return { requestId: ++this.latest, token: this.token };
  }
  register(panel: RevealPanel): () => void {
    this.panels.set(panel.id, panel);
    for (const changed of this.changed) {
      changed();
    }
    return () => {
      if (this.panels.get(panel.id) === panel) {
        this.panels.delete(panel.id);
      }
    };
  }
  async deliver(
    intent: NavigationIntent,
    id: string,
    target: NavigationTarget,
  ): Promise<boolean> {
    if (intent.token.cancelled) {
      return false;
    }
    const panel = await this.destination(id, intent.token);
    if (!panel || intent.token.cancelled) {
      return false;
    }
    try {
      const applied = await panel.reveal(
        { ...target, requestId: intent.requestId },
        intent.token,
      );
      return (
        applied && this.panels.get(id) === panel && !intent.token.cancelled
      );
    } catch (error) {
      if (intent.token.cancelled) {
        return false;
      }
      throw error;
    }
  }
  private destination(
    id: string,
    token: NavigationIntent["token"],
  ): Promise<RevealPanel | undefined> {
    const ready = this.panels.get(id);
    if (ready) {
      return Promise.resolve(ready);
    }
    // Vault initialization may still be starting this exact panel's links plugin.
    return new Promise((resolve) => {
      let stop: Disposer = () => {};
      const finish = (panel?: RevealPanel) => {
        clearTimeout(timer);
        this.changed.delete(check);
        void stop();
        resolve(panel);
      };
      const check = () => {
        const panel = this.panels.get(id);
        if (panel) {
          finish(panel);
        }
      };
      const timer = setTimeout(() => finish(), 15000);
      this.changed.add(check);
      stop = token.onCancel(() => finish());
      check();
    });
  }
}

/** Select once from native shells; never guess among same-URI split panes. */
export function chooseRevealPanel(
  panels: readonly PanelShell[],
  before: ReadonlySet<string>,
  target: { uri: string; side: boolean; column: number },
): PanelShell | undefined {
  const candidates = panels.filter(
    (panel) => panel.document.uri === target.uri,
  );
  const created = candidates.filter((panel) => !before.has(panel.id));
  const reused = candidates.filter((panel) =>
    target.side
      ? panel.column !== target.column
      : panel.column === target.column,
  );
  const pool = created.length > 0 ? created : reused;
  return pool.length === 1 && pool[0]?.active() ? pool[0] : undefined;
}
