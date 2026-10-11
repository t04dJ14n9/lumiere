# Lifecycle conformance, Stage 1

These 18 scenarios specify lifecycle completion independently of the runtime
under test. Native expectations are identical in both repositories. The only
native N/A is PDF early release: `PluginScope.acquire` returns the acquired
resource and has no supported early-release handle.

The contracts cover joined activation and release, dependency barriers during
restart and already-running teardown, cancellation without waiting for an
uncooperative initializer, rollback/disposal overlap (including failed inverses),
cleanup continuation, transitive dependency order and LIFO, early release,
generation safety, provider replacement during initialization, permanent
shutdown, and rejected late inverses. Process `unhandledRejection` listeners
surround every executed scenario, through fixture teardown and an event-loop
checkpoint; every scenario asserts zero unhandled rejections.

`harness.ts` has no runtime or platform imports. The scenarios and Node unit-test
runner import no application runtime. A new adapter can run these same scenarios
without modifying their assertions. No browser/native tests or production code
are added or removed.

## Files and synchronization

- `harness.ts`: plugin, scope, service, lifecycle and deferred-gate contracts.
- `fixture.ts`: gates, observed caller promises and failure-safe drainage.
- `scenarios.ts`: the canonical scenario definitions and assertions.
- `run-suite.ts`: sequential Node test registration and rejection monitoring.
- `cordis-stub.ts`: runnable, explicitly unavailable Cordis adapter skeleton.
- `sync.py`: copies this README and the five TypeScript files into both repos.

Canonical source lives at `/workspace/plans/cordis-conformance`. Each repo commits
a complete snapshot under `test/unit/lifecycle-conformance/shared`, so CI and
`pnpm test` do not depend on an external directory. Modify canonical source, run
Prettier with Markdown's defaults on it, then run:

```sh
python3 /workspace/plans/cordis-conformance/sync.py
```

The script only writes the named snapshot files. Repository-specific adapters
and the top-level `test/unit/lifecycle-conformance.test.ts` entrypoint stay in
their respective repos. The top-level entrypoint works with both existing test
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

## Cordis skeleton and adoption gate

The intended comparison version is exactly `cordis@4.0.0-rc.10`. This Stage 1
skeleton does not import or emulate Cordis: invoking its activation endpoint
rejects with a clear unsupported-adapter error, tested by an executable smoke
test. All 18 conformance scenarios are registered with explicit pending-adapter
skip reasons. A skip is neither a measured Cordis failure nor evidence of
conformance. No native assertion is weakened, and no package dependency is
needed for this skeleton.

Installing the pinned artifact was attempted during Stage 1, but registry DNS
failed (`EAI_AGAIN`). The local cache had metadata but no Cordis artifact. A
public-API implementation remains future work: pin the exact version as a
devDependency, implement this factory, then remove skips one scenario at a time.
Keep service staging, initializer cancellation, joined release, cleanup
continuation, already-stopping dependents and permanent application shutdown as
explicit gates. The decision memo's A–G findings are source-audit hypotheses;
do not label them executed failures without running a concrete adapter.

No Stage 2 work is authorized: do not change production kernels or plugins,
remove legacy runtimes, merge, push or publish as part of this suite.
