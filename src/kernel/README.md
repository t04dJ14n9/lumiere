# Plugin kernel

The root Context owns a tree of fibers. A fiber declares injected services,
waits for its required providers, and applies with a fresh Context.
`await root.settled()` waits for the current activation and re-gating work.

Lifecycle invariants (tested in `test/unit/kernel/transaction.test.ts` and
`lifecycle.test.ts`):

- **Activation is a transaction.** Everything `apply` acquires (effects,
  listeners, resources passed to `ctx.acquire(kind, resource)`, child plugins)
  belongs to the activation until it commits. Services are published only on
  commit, and child plugins started during `apply` are held and start only on
  commit. A failing `apply` releases everything and leaves no trace.
- **Teardown mirrors activation.** Stopping first withdraws the plugin's
  services and waits until every consumer of them has finished stopping (those
  this stop stopped and those already stopping for another reason, such as a
  disable or a second prerequisite lost at the same time), so nothing backing
  a service disappears under a consumer still using it. Then effects and child
  plugins are released together, last acquired first. Disposal errors are
  logged and do not stop the rest. Concurrent `dispose()` calls all wait for
  the same teardown.
- **Late work is refused.** A disposed context rejects late registrations
  from asynchronous callbacks; a resource handed to `acquire` afterwards is
  released at once.
- **Every resource is accounted for.** `runtime.ledger` counts live resources
  by owner (plugin name) and kind (`effect`, `listener`, `fiber`, `service`,
  or the kind given to `acquire`). A resource leaves the ledger only once its
  cleanup has finished; a cleanup that throws leaves a `failed <kind>` entry
  behind, so a failed teardown never looks clean. A plugin that stopped
  cleanly owns nothing; the per-plugin leave-no-trace tests (core hosts
  included) compare ledger snapshots and assert no teardown error was logged.

Services are typed through declaration merging of `Services` in `types.ts`.
The context Proxy enforces injection declarations. Non-replaceable names have
one provider. Replaceable names have a stack: newest wins and stopping it restores
the previous provider. Consumers restart when an injected service changes.
A failing plugin rolls back its registrations and stays failed until updated.
Event listeners fail independently and log against their owning fiber.

Intentional differences from Cordis:

- This is a dependency-free, in-house subset with an explicit pure runtime;
  it does not implement Cordis's full API or depend on its implementation.
- Moving to the real `cordis` package is **not** a mechanical change; see
  DESIGN.md §5.9. Event semantics differ: our `pipeline` is awaited and
  ranked, `bail` is synchronous and may return a promise representing claimed
  work, and a throwing listener is logged and skipped. Cordis's `waterfall`,
  `bail` and exception propagation behave differently.
- Cleanup completion is joined: `dispose()` waits for releases already
  running, every resource is released in reverse order even after a failure,
  and a provider waits for consumers that are already stopping. Cordis calls a
  disposer at most once without joining it, chains the disposers of one effect
  without per-disposer recovery, and finds consumers only among registered
  fibers.
- Unloading does not wait for initialization to finish where a runtime cancels
  a starting scope; Cordis's unload waits, and its HMR does not roll back a
  failed replacement.
- Required and optional injection, replaceable provider stacks, staged
  publication and plugin manifests have no Cordis equivalent.
- Services are published atomically after `apply` succeeds, avoiding consumers
  seeing a partly initialized async provider. Service subclasses publish after
  `start`. Optional injection changes restart consumers as required injection
  changes do, so they can attach and detach optional integrations.
- Names explicitly declared replaceable use provider stacks.
- `Context.create`, `settled`, injected logging and runtime timers provide
  deterministic host, browser and test integration.
- Root contexts have no fiber; plugin contexts do. No platform timer, console,
  DOM, VS Code or Node APIs exist in the kernel.
- Config schemas (`src/shared/schema.ts`, re-exported here) reject unexpected object keys. They emit JSON Schema and infer
  optional/defaulted properties; validation errors carry a property path.
- Plugin channels use the shared RPC endpoint. Its transport and timer adapter
  are injected. It validates envelopes, parameters and results at both ends,
  defaults to a ten-second deadline, and cancels handlers on channel removal.

External service isolation belongs to the public API boundary; ordinary child
plugins share this kernel's service tree.

Composition uses `Context.create({ rank })`: rank is the catalog position of
an owner. Events sort by prepend slot, rank, then owner ID (for tied ranks),
keeping registration order within an owner. Restarting a fiber cannot move its
listeners behind another owner. Equal-rank external owners sort by ID.

A service can implement the exported `[bindCaller](context)` symbol to return a
consumer facade. Reads still require declared injection; the facade is cached
by provider identity within the consuming context. The hook receives that actual
context, including its fiber name and tagged logger. Replacement and restart get
fresh caches; ordinary services retain their shared identity.

Fiber generations invalidate pending async activation before stop awaits cleanup.
A stale activation may finish its own work, but cannot publish a service or replace
the error/status of the current generation. Context proxies reserve `then` because
Promise assimilation probes it; service reads otherwise validate injection and
bind capabilities to the actual consumer proxy.
