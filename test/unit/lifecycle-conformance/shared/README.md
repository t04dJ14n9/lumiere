# Lifecycle conformance, Stage 1

These 23 scenarios specify lifecycle completion independently of the runtime
under test. Native expectations are identical in both repositories. The only
native N/A is PDF early release: `PluginScope.acquire` returns the acquired
resource and has no supported early-release handle.

The contracts cover joined activation and release, dependency barriers during
restart and already-running teardown, cancellation without waiting for an
uncooperative initializer, two-wave late acquisition during disable/dispose
drainage (including a rejecting final inverse), rollback/disposal overlap
(including failed inverses), cleanup continuation, transitive provider-disable
barriers, dependency order and LIFO, early release,
generation safety, provider replacement during initialization, permanent
shutdown, and rejected late inverses. Process `unhandledRejection` listeners
surround every executed scenario, through fixture teardown and an event-loop
checkpoint; every scenario asserts zero unhandled rejections.

`harness.ts` has no runtime or platform imports. The scenarios and Node unit-test
runner import no application runtime. A new adapter can run these same scenarios
without modifying their assertions. No browser/native tests are added or removed.
Stage 1 includes baseline completion fixes in Markdown's `Fiber.dispose` and
PDF's `PluginScope.release`; production remains on the existing native runtimes.

The review additions keep the original cancellation and dependency/LIFO cases:

| Scenario | Additional completion barrier |
| --- | --- |
| `late-drain-disable-success` | Both disable callers wait for late B after the ordinary inverse and late A finish. |
| `late-drain-disable-error` | The same barrier when B rejects; its rejection stays handled. |
| `late-drain-dispose-success` | Both dispose callers join both waves of late inverses. |
| `late-drain-dispose-error` | The same barrier when B rejects; its rejection stays handled. |
| `transitive-provider-disable` | Provider disable alone starts and joins gated leaf cleanup before consumer/provider backing releases, with non-topological catalog order. |

## Files and synchronization

- `harness.ts`: plugin, scope, service, lifecycle and deferred-gate contracts.
- `fixture.ts`: gates, observed caller promises and failure-safe drainage.
- `scenarios.ts`: the canonical scenario definitions and assertions.
- `run-suite.ts`: sequential Node test registration and rejection monitoring.
- `meta.ts`: harness isolation meta-tests (F3 timeout/abort unwinding, bounded
  cleanup, listener removal, hung-case-then-control; F4 error aggregation;
  infrastructure errors never satisfy a known failure).
- `cordis-stub.ts`: unavailable adapter endpoint and an explicit skip reason for
  every scenario. No Cordis dependency or runtime is installed.
- `sync.py` (external): copies the canonical snapshot into both repos.

The original canonical source lives at `/workspace/plans/cordis-conformance`.
Each repo commits a self-contained snapshot under
`test/unit/lifecycle-conformance/shared`, so CI and `pnpm test` do not depend on
an external directory. This branch keeps the Stage 1 stub; syncing later
characterization work from the external directory requires a separate review.
Repository-specific adapters and the top-level
`test/unit/lifecycle-conformance.test.ts` entrypoint stay in their respective repos. The top-level entrypoint works with both existing test
commands. To run just this suite, from either repo:

```sh
pnpm exec tsx --test test/unit/lifecycle-conformance.test.ts
```

## Adapter boundaries

Markdown maps named enable to a retained `Fiber`, `disable` to `Fiber.dispose`,
and restart to `Fiber.update`. Joining uses the kernel's `Context.settled`, not
an adapter-owned release queue. Its dependency graph is expressed through each
required plugin's declared service. It normalizes `loading` to `starting` and
`pending`/`disposed` to `inactive`; tests also observe services and independently
tracked resources, rather than relying only on state names.

PDF delegates enable/disable/dispose directly to `PluginRuntime`. Restart is
the public disable-then-enable sequence; dependents are explicitly enabled after
restart because PDF does not automatically re-enable them. The restart scenario
tests safety of this sequence, not automatic restart or atomic replacement.
`service()` uses a captured scope's public `find`, which observes the current
runtime lookup, including after that scope stops.

Both adapters leave cancellation, release ownership, rollback, error handling
and dependency-stop barriers to the native runtime. They add no cleanup
memoization or cancellation machinery.

Deferred gates, not timed sleeps, establish the adversarial interleavings.
`setImmediate` checkpoints allow queued promise callbacks and rejection events
to run before pending-state assertions. Test timeouts only bound a broken test.
Fixture teardown opens all gates and awaits all tracked callers and disposal,
including when an assertion fails.

## Cordis Stage 1 boundary

All 23 Cordis scenarios are skipped with a reason naming the pending invariant.
The stub refuses activation, disable and restart instead of simulating lifecycle
behaviour. A smoke test verifies that refusal and the inactive state. A real
public-API adapter and any Cordis characterization belong in a separate change;
this suite does not claim Cordis conformance.

The harness retains timeout and abort unwinding, bounded idempotent cleanup,
listener removal and aggregated failure reporting. Its meta-tests exercise those
failure paths against the native adapter. No production kernel is replaced.
