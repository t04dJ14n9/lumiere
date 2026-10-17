import type { Context, Disposer } from "../../kernel";
import type { NavigationTarget, PanelShell } from "../../shared/runtime";
import { CancelToken, type Cancellation } from "../../shared/rpc/lifecycle";
import type {} from "../editor/api";
import { protocol } from "./protocol";

export function registerNavigation(ctx: Context, panel: PanelShell): void {
  const navigation = new PanelNavigation(ctx, panel);
  ctx.on("editor/loading", () => navigation.loading());
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "ready", ({ session }) =>
      navigation.initialize(session),
    ),
  );
  ctx.effect(() => () => navigation.dispose());
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "missing", ({ fragment }) => {
      ctx.workshop.inform?.(`Heading or block was not found: #${fragment}`);
      return true;
    }),
  );
  if (ctx.workshop.navigation) {
    ctx.effect(() =>
      ctx.workshop.navigation!.registerReveal({
        id: panel.id,
        uri: panel.document.uri,
        active: () => panel.active(),
        reveal: (target, token) => navigation.reveal(target, token),
      }),
    );
  }
}

class PanelNavigation {
  private ready = false;
  private live = true;
  private latest = 0;
  private session = "";
  private delivery: CancelToken | undefined;
  private readonly waiters = new Set<(ready: boolean) => void>();

  constructor(
    private readonly ctx: Context,
    private readonly panel: PanelShell,
  ) {}

  loading(): void {
    this.ready = false;
    // The first loading message must not cancel an already queued cold open.
    if (this.session) {
      this.latest++;
      this.delivery?.cancel();
    }
  }

  initialize(session: string): boolean {
    // An unannounced replacement invalidates the previous webview, but a new
    // request queued after loading belongs to this new session and must survive.
    if (this.ready && this.session !== session) {
      this.latest++;
      this.delivery?.cancel();
    }
    this.session = session;
    this.ready = true;
    for (const finish of this.waiters) {
      finish(true);
    }
    this.waiters.clear();
    return true;
  }

  async reveal(
    target: NavigationTarget & { requestId: number },
    token: Cancellation,
  ): Promise<boolean> {
    const request = ++this.latest;
    // Capture before wait: a reveal that started while cold and finds the pane
    // inactive once ready means the user left during load — still cancel.
    // An already-ready pane that is merely unfocused (Outline / sidebar) must
    // still navigate; requiring active() made Outline clicks a silent no-op.
    const waitedForReady = !this.ready;
    if (!this.ready && !(await waitUntilReady(this.waiters, token))) {
      return false;
    }
    if (
      !this.live ||
      token.cancelled ||
      request !== this.latest ||
      (waitedForReady && !this.panel.active())
    ) {
      return false;
    }
    if (!this.panel.active()) {
      this.panel.reveal();
    }
    this.delivery?.cancel();
    const local = new CancelToken();
    this.delivery = local;
    const stop = token.onCancel(() => local.cancel());
    try {
      const applied = await this.ctx.rpc.call(
        protocol,
        "navigate",
        {
          ...target,
          session: this.session,
        },
        { token: local },
      );
      return (
        applied && this.live && !token.cancelled && request === this.latest
      );
    } catch (error) {
      if (local.cancelled) {
        return false;
      }
      throw error;
    } finally {
      void stop();
    }
  }

  dispose(): void {
    this.live = false;
    this.delivery?.cancel();
    for (const finish of this.waiters) {
      finish(false);
    }
    this.waiters.clear();
  }
}

function waitUntilReady(
  waiters: Set<(ready: boolean) => void>,
  token: Cancellation,
): Promise<boolean> {
  if (token.cancelled) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let stop: Disposer = () => {};
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      waiters.delete(finish);
      void stop();
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), 15000);
    waiters.add(finish);
    stop = token.onCancel(() => finish(false));
  });
}
