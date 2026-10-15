import { CancelToken } from "../../shared/rpc/lifecycle";
import { contributionId } from "../../shared/setting-schema";
import type { Context, Disposer } from "../../kernel";
import type { EditorPanel, Editors } from "./api";
import type { SourceEdit } from "../../shared/runtime";
import { SourceCoordinates } from "../../shared/document/coordinates";
import {
  JumpHistory,
  mapAnchor,
  mapSourceOffset,
  type JumpAnchor,
  type MarkdownLocation,
} from "./jump-history";
import { protocol } from "./jump-protocol";

interface PaneHistory {
  history: JumpHistory;
  panel: EditorPanel;
  stop: Disposer;
  busy: boolean;
  sequence: number;
  previous?: { session: string; attempt: number; inherited: boolean };
  token?: CancelToken;
}

export function registerJumpHistory(ctx: Context, editors: Editors): void {
  const histories = new PaneHistories(ctx, editors);
  ctx.on("editor/opened", (panel) => histories.register(panel.id));
  ctx.on("editor/closed", (panel) => histories.close(panel.id));
  ctx.on("editor/activeChanged", () => histories.activeChanged());
  ctx.on("document/changed", (session, edits) => {
    histories.changed(session, edits);
  });
  for (const [name, direction] of [
    ["jumpBack", -1],
    ["jumpForward", 1],
  ] as const) {
    ctx.effect(() =>
      ctx.workbench.command(contributionId(name), () =>
        histories.move(direction),
      ),
    );
  }
  ctx.effect(() => () => histories.dispose());
  for (const panel of editors.all()) {
    histories.register(panel.id);
  }
  histories.refresh();
}

class PaneHistories {
  private readonly panes = new Map<string, PaneHistory>();
  private readonly workbench;

  constructor(
    private readonly ctx: Context,
    private readonly editors: Editors,
  ) {
    this.workbench = ctx.workbench;
  }

  register(id: string): void {
    const panel = this.editors.all().find((item) => item.id === id);
    if (!panel || this.panes.has(id)) {
      return;
    }
    const history = new JumpHistory();
    const stop = panel.rpc.handle(protocol, "record", (jump) => {
      const before = rebaseAnchor(panel, jump.before, jump.version);
      const after = rebaseAnchor(panel, jump.after, jump.version);
      if (
        !before ||
        !after ||
        !validAnchor(panel, before) ||
        !validAnchor(panel, after)
      ) {
        return false;
      }
      history.record(location(panel, before), location(panel, after));
      this.refresh();
      return true;
    });
    this.panes.set(id, { history, panel, stop, busy: false, sequence: 0 });
  }

  close(id: string): void {
    const pane = this.panes.get(id);
    pane?.token?.cancel();
    void pane?.stop();
    this.panes.delete(id);
    this.refresh();
  }

  activeChanged(): void {
    for (const pane of this.panes.values()) {
      if (!pane.panel.active()) {
        pane.token?.cancel();
      }
    }
    this.refresh();
  }

  changed(
    session: EditorPanel["session"],
    edits?: readonly SourceEdit[],
  ): void {
    if (edits?.length === 0) {
      return;
    }
    for (const pane of this.panes.values()) {
      if (pane.panel.session === session) {
        mapHistory(pane.history, edits);
      }
    }
    this.refresh();
  }

  async move(direction: -1 | 1): Promise<void> {
    const pane = this.panes.get(this.editors.active()?.id ?? "");
    if (!pane || pane.busy) {
      return;
    }
    pane.busy = true;
    const token = new CancelToken();
    pane.token = token;
    const live = () =>
      this.ctx.isLive &&
      this.panes.get(pane.panel.id) === pane &&
      pane.panel.active() &&
      !token.cancelled;
    try {
      await replay(pane, direction, live, token);
    } catch (error) {
      if (!token.cancelled) {
        this.workbench.error(`Note navigation failed: ${String(error)}`);
      }
    } finally {
      pane.busy = false;
      this.refresh();
    }
  }

  refresh(): void {
    const history = this.panes.get(this.editors.active()?.id ?? "")?.history;
    void this.workbench.execute(
      "setContext",
      "markdownWorkbench.canJumpBack",
      history?.canBack ?? false,
    );
    void this.workbench.execute(
      "setContext",
      "markdownWorkbench.canJumpForward",
      history?.canForward ?? false,
    );
  }

  dispose(): void {
    for (const pane of this.panes.values()) {
      pane.token?.cancel();
      void pane.stop();
    }
    this.panes.clear();
    this.refresh();
  }
}

async function replay(
  pane: PaneHistory,
  direction: -1 | 1,
  live: () => boolean,
  token: CancelToken,
): Promise<void> {
  const { panel, history } = pane;
  await panel.session.flush();
  if (!live()) {
    return;
  }
  const current = await panel.rpc.call(protocol, "capture", {}, { token });
  if (
    !live() ||
    current.version !== panel.session.version ||
    !validAnchor(panel, current.anchor)
  ) {
    return;
  }
  if (
    pane.previous &&
    !pane.previous.inherited &&
    current.session === pane.previous.session &&
    current.startedAttempt !== undefined &&
    current.startedAttempt < pane.previous.attempt
  ) {
    history.releaseDeparture();
  }
  const inherited = history.hasDeparture;
  const plan = history.plan(direction, location(panel, current.anchor));
  if (!plan) {
    return;
  }
  const coordinates = new SourceCoordinates(panel.document.getText());
  history.attempt(plan);
  const attempt = ++pane.sequence;
  pane.previous = { session: current.session, attempt, inherited };
  const applied = await panel.rpc.call(
    protocol,
    "restore",
    {
      attempt,
      anchor: mapAnchor(plan.location.anchor, (at) => coordinates.toEditor(at)),
      version: current.version,
      generation: current.generation,
      session: current.session,
    },
    { token },
  );
  if (applied && live() && current.version === panel.session.version) {
    history.commit(plan);
    delete pane.previous;
  }
}

function location(panel: EditorPanel, anchor: JumpAnchor): MarkdownLocation {
  const coordinates = new SourceCoordinates(panel.document.getText());
  return {
    kind: "markdown",
    uri: panel.document.uri,
    anchor: mapAnchor(anchor, (at) => coordinates.toSource(at)),
  };
}

function validAnchor(panel: EditorPanel, anchor: JumpAnchor): boolean {
  const length = panel.session.text.length;
  return (
    anchor.selection.anchor <= length &&
    anchor.selection.head <= length &&
    anchor.scroll.from <= length
  );
}

function mapHistory(history: JumpHistory, edits?: readonly SourceEdit[]): void {
  if (!edits) {
    history.clear();
    return;
  }
  history.map((entry) => ({
    ...entry,
    anchor: mapAnchor(entry.anchor, (at) => mapSourceOffset(at, edits)),
  }));
}

function rebaseAnchor(
  panel: EditorPanel,
  anchor: JumpAnchor,
  version: number,
): JumpAnchor | undefined {
  if (version === panel.session.version) {
    return anchor;
  }
  const offsets = panel.session.mapOffsets?.(version, [
    anchor.selection.anchor,
    anchor.selection.head,
    anchor.scroll.from,
  ]);
  if (!offsets || offsets.length !== 3) {
    return undefined;
  }
  return {
    selection: { anchor: offsets[0]!, head: offsets[1]! },
    scroll: { ...anchor.scroll, from: offsets[2]! },
  };
}
