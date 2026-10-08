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

External service isolation is implemented at the API boundary in Phase 7;
ordinary child plugins share this kernel's service tree.
