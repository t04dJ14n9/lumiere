# Plugin kernel

The root Context owns a tree of fibers. A fiber declares injected services,
waits for its required providers, and applies with a fresh Context. Registrations
are effects; stop undoes effects in reverse order, then children, then services.
`await root.settled()` waits for the current activation and re-gating work.
A disposed context rejects late registrations from asynchronous callbacks.

Services are typed through declaration merging of `Services` in `types.ts`.
The context Proxy enforces injection declarations. Non-replaceable names have
one provider. Replaceable names have a stack: newest wins and stopping it restores
the previous provider. Consumers restart when an injected service changes.
A failing plugin rolls back its registrations and stays failed until updated.
Event listeners fail independently and log against their owning fiber.

Intentional differences from Cordis:

- This is a dependency-free, in-house subset with an explicit pure runtime;
  it does not implement Cordis's full API or depend on its implementation.
- `waterfall` is asynchronous. `bail` remains synchronous and may return a
  promise representing claimed work.
- Services are published atomically after `apply` succeeds, avoiding consumers
  seeing a partly initialized async provider. Service subclasses publish after
  `start`. Optional injection changes restart consumers as required injection
  changes do, so they can attach and detach optional integrations.
- Names explicitly declared replaceable use provider stacks.
- `Context.create`, `settled`, injected logging and runtime timers provide
  deterministic host, browser and test integration.
- Root contexts have no fiber; plugin contexts do. No platform timer, console,
  DOM, VS Code or Node APIs exist in the kernel.
- Config schemas reject unexpected object keys. They emit JSON Schema and infer
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
