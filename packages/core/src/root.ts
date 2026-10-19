import { Activation } from "./activation";
import type { Disposer } from "./activation";
import { ContextImpl } from "./context";
import { silentLogger, taggedLogger } from "./logger";
import type { Logger } from "./logger";
import type { PluginHandleImpl } from "./plugin-handle";
import { Runtime } from "./runtime";
import type { PluginHandle, RootContext, ServiceName, Services } from "./types";

export interface RootOptions {
  logger?: Logger;
  /** Composition rank of a plugin: lower ranks get events (and keymaps) first. */
  rank?: (owner: string) => number;
}

/** Create the root of a plugin tree: an extension host, a webview, or a test. */
export function createRoot(options: RootOptions = {}): RootContext {
  const runtime = new Runtime(
    options.logger ?? silentLogger,
    options.rank ?? (() => 0),
  );
  const activation = new Activation(
    "root",
    runtime.ledger,
    taggedLogger(runtime.logger, "root"),
  );
  return new RootContextImpl(runtime, activation);
}

class RootContextImpl extends ContextImpl implements RootContext {
  private disposing?: Promise<void>;

  constructor(runtime: Runtime, activation: Activation) {
    super(runtime, activation, {
      owner: "root",
      publish: (name, value) => runtime.cordis.provide(name, value) as Disposer,
      startChild: (child: PluginHandleImpl<unknown>) => child.start(),
    });
  }

  get plugins(): readonly PluginHandle[] {
    return [...this.runtime.started] as PluginHandleImpl<unknown>[];
  }

  service<K extends ServiceName>(name: K): Services[K] | undefined {
    return this.runtime.get(name) as Services[K] | undefined;
  }

  get providers(): ReadonlyMap<ServiceName, string> {
    return new Map(
      [...this.runtime.published].map(([name, { owner }]) => [name, owner]),
    );
  }

  get ledger(): RootContext["ledger"] {
    return this.runtime.ledger;
  }

  /** Stop every plugin, last started first, then withdraw the root's services. */
  dispose(): Promise<void> {
    this.disposing ??= this.activation
      .dispose()
      .then(() => this.runtime.close());
    return this.disposing;
  }
}
