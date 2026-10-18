# @workshop/core

The plugin core of Markdown and Lumière PDF: every capability is a plugin
that reads services, provides services and owns effects. It runs unchanged in
the extension host, in each webview and in unit tests (no DOM, VS Code or Node
APIs).

## How it works

[Cordis](https://github.com/cordiverse/cordis) (`cordis`, pinned exactly) runs
the plugins: each plugin is a Cordis fiber that starts once every service it
injects is available, restarts when one is replaced, and stops only after the
plugins that depend on its services have stopped.

This package is the small layer plugins actually program against. It adds
what Cordis does not guarantee:

- **Resources are released last-first, one at a time, and joined.** Each start
  of a plugin gets an `Activation` that owns its effects, listeners, services
  and child plugins. Every release (early, rollback, stop, concurrent stops)
  waits for the same cleanup, and a stop resolves only once every cleanup has
  settled. A failing cleanup is logged and the rest still run.
- **A start can be abandoned.** Stopping, or a dependency changing, while an
  asynchronous `apply` is still running does not wait for it: whatever the
  abandoned `apply` acquires afterwards is undone at once.
- **Optional services.** Cordis gates on every injected service. Optional
  services are injected while they exist, and the plugin is re-plugged when
  one appears or disappears.
- **An ordered event bus.** Listeners run by plugin rank, so a restarted plugin
  keeps its place; a throwing listener is logged and skipped instead of
  breaking the emitter.
- **Ownership is a tree.** A plugin's children are owned by its activation and
  start only after its `apply` succeeds. (Cordis fibers are all created on the
  tree's Cordis root; the tree is tracked here.)
- **Declared dependencies.** A plugin reads only the services it `inject`s
  and publishes only the services it lists in `provides`; anything else
  throws. A root context provides anything. So the definitions alone say
  which plugin needs which, and tools can check that graph without running it.

`packages/core/test/conformance` holds 23 lifecycle scenarios (joined
release, cancellation, rollback, dependency barriers, late drains) that the
core must pass. Stock Cordis 4.0.0-rc.11 passes 6 of them; run them again
before upgrading Cordis.

## Files

- `index.ts`: the public API.
- `types.ts`: `Services`, `Events` (extended by declaration merging),
  `Plugin`, `PluginHandle`, `Context`, `RootContext`.
- `root.ts`: `createRoot`, the root of a plugin tree.
- `plugin-handle.ts`: one started plugin over its Cordis fiber.
- `context.ts`: the context a plugin works through.
- `activation.ts`: the resource stack of one start.
- `runtime.ts`: state one tree shares (Cordis root, event bus, ledger).
- `event-bus.ts`: ranked, error-isolated events.
- `ledger.ts`: live resources by owner and kind, for leak tests.
- `caller.ts`: caller-bound service facades.
- `schema.ts`: configuration schemas (runtime validation, JSON Schema).
- `errors.ts`, `logger.ts`.

## Using it

```ts
import { createRoot, type Plugin } from "@workshop/core";

declare module "@workshop/core" {
  interface Services {
    greeter: { greet(name: string): string };
  }
}

const greeter: Plugin = {
  name: "greeter",
  provides: ["greeter"],
  apply(ctx) {
    ctx.provide("greeter", { greet: (name) => `Hello, ${name}` });
  },
};

const consumer: Plugin = {
  name: "consumer",
  inject: { required: ["greeter"] },
  apply(ctx) {
    ctx.logger.debug(ctx.greeter.greet("world"));
    ctx.effect(() => () => ctx.logger.debug("stopped"));
  },
};

const root = createRoot();
root.plugin(consumer); // waits for greeter
root.plugin(greeter);
await root.settled();
await root.dispose();
```

## Reading services

Read a service from the context in `apply` and keep the value; don't hand
out getters such as `() => ctx.vim`. A stopped context refuses reads
(`Disposed: <plugin> is stopped`), and code handed to others can still run
while the plugin is being released: each editor extension it removes
reconfigures the editor, which updates the extensions released after it.
Optional services need no getter either, since the plugin restarts when one
comes or goes.

## Limits

- Cancellation cannot stop arbitrary JavaScript: an abandoned `apply` keeps
  running until it returns; only its late acquisitions are refused.
- `settled()` waits for abandoned starts too, so an `apply` that never returns
  keeps `settled()` pending (stopping is never blocked by it).
- Cordis's API is not yet stable. Upgrade only with the conformance suite
  passing.
