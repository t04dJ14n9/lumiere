Recommendation: adopt Cordis only as a reference and differential-test implementation, not as the production runtime for either extension at present. I would not choose extension-host-only adoption as a compromise.

The decisive issue is not bundle size, MIT licensing, or the cost of mechanically porting 47 plugins. It is that the inspected Cordis implementation does not provide several of the stronger asynchronous lifecycle guarantees you need. In particular, “invoke cleanup at most once” is not the same guarantee as “every concurrent caller waits for cleanup to finish.” Cordis has the former without consistently providing the latter. 

By “reference/test oracle,” I mean a differential comparison target for shared semantics—not the authoritative oracle for asynchronous correctness. Your independently specified lifecycle invariants must be the oracle.

Audit scope

I inspected Markdown Workshop main at 6e6c88a, embedPDF main at c22df1f, and Cordis main at 518b8bc. Cordis’s package manifest at that commit identifies version 4.0.0-rc.10. These are source snapshots; I did not establish byte-for-byte equivalence between the Cordis checkout and the published npm artifact.   

The concurrency findings below are source-level counterexamples, not claims that I executed failing tests. Your main snapshots still contain relevant gaps, so “keep the existing runtime” must mean “repair and narrow it,” not “consider it finished.”

1. Why I recommend reference-only adoption

Cordis offers useful machinery: ownership-aware contexts, reactive service dependencies, provider snapshots, effect composition, isolation, and a serialized fiber transition mechanism. Its source is substantially more sophisticated than a simple disposable registry. Those are legitimate reasons to study it.   

However, replacing your kernels would not eliminate the need to maintain:

• A barrier that includes cleanup already running.
• Dependency ordering that includes consumers already being removed.
• A policy for cancelled initialization and late asynchronous continuations.
• Application-specific shutdown for servers, panels, RPC operations, workers, and PDF engines.

The source comparisons below show why these cannot simply be delegated to the inspected Cordis runtime.

Host-only adoption does not avoid this problem. Your PDF bridge and Markdown panel teardown are precisely where asynchronous completion matters. It would introduce a second lifecycle implementation while leaving the hardest browser-side ownership problems intact.

The paper exists. Its formal framework is relevant, but it is not a certification of the particular JavaScript promise interleavings in this release. Its implementation discussion leaves correctness of inverse operations to their authors; its limitations discussion does not provide a quantitative performance evaluation. A formal composability discipline and a verified implementation of your shutdown contract are different things. [arXiv](https://arxiv.org/abs/2608.25512)

2. Lifecycle comparison and whether Cordis prevents your reported bugs

I can map the four failure classes in your request precisely. I could not reconstruct a complete, authoritative commit-by-commit numbering of all four historical review rounds, so I will not invent a chronology.

A. Disposal finishes while an earlier release is still running

Your Markdown kernel:

In src/kernel/context.ts, an individual held resource memoizes its release promise. That correctly joins repeated calls to that resource’s release function.

But it removes the resource from this.held before awaiting its cleanup. Context.teardown() subsequently walks this.held, without a separate collection of releases already in flight. Therefore, an early release can become invisible to context disposal while its cleanup is still pending. 

Cordis:

In packages/core/src/fiber.ts, effect() constructs a disposer wrapper containing:

“if (!runner.epoch) return”

The first call clears runner.epoch. A subsequent call returns immediately, rather than returning the first call’s cleanup promise.

Additionally, the local disposal list contains the operation that removes the wrapper from the fiber’s disposable list. Because that local list is reversed during disposal, removal happens before the asynchronous cleanup completes. Fiber._unload() cannot await an early-released effect that has already disappeared from its list. Plugin fiber disposal itself is implemented through this effect mechanism.  

A concrete failing schedule is: start an effect’s release; suspend its cleanup on a promise; dispose its owning fiber; observe that the fiber no longer necessarily owns a promise representing that cleanup.

Verdict: Cordis would not prevent this class. It contains the same ownership/completion distinction, and its repeated-disposer behavior is weaker than your Markdown per-resource promise memoization.

B. Rollback overlaps disposal

Your PDF kernel:

The relevant implementation is src/extension/runtime/plugin-runtime.ts, not the plugins directory itself.

PluginRuntime.deactivate() joins ordinary teardown through the stopping map. But rollback() calls PluginScope.release() independently. release() uses held.splice(0).reverse() and does not memoize a release promise.

Consequently, rollback can take the resources out of held and suspend while disposing one. Concurrent runtime disposal finds the starting scope and calls release() again; that second release sees an empty held array and can finish before rollback’s original cleanup. 

Your existing tests cover concurrent disposal of an active plugin and an already-stopping dependent. Those are useful tests, but they do not exercise the separate rollback-versus-dispose path in the inspected test file. 

Cordis:

There is a real improvement here: Fiber.inertia, _setEpoch(), _reload(), and _unload() serialize a fiber’s ordinary load/unload transitions. A failed plugin initialization goes through that transition machinery rather than two independently callable scope-release loops.

But effect() also has a separate asynchronous failure-cleanup path, task.catch(dispose). That cleanup is not consistently represented by a shared completion promise returned by every disposal path. Combine this with early removal and the repeated-call guard above, and the general “rollback has finished before disposal resolves” guarantee still does not follow. 

There is also a policy difference: Cordis’s ordinary unload transition waits for its current initialization work to settle. An initialization promise that never resolves can therefore block disposal. Your PDF runtime deliberately cancels a starting scope without waiting indefinitely for activate() to return.   

Verdict: partially. Cordis prevents some ordinary fiber-transition overlap, but it is not a drop-in solution to the stronger rollback/disposal completion contract.

C. A provider is released while a dependent is already stopping

Your kernels:

Markdown Runtime.changed() explicitly includes fibers in the runtime-wide stopping map when withdrawn services intersect their required or optional dependencies. This matters because those fibers may no longer be in the ordinary active-fiber set.

PDF PluginRuntime.deactivate() similarly awaits relevant dependents already represented in stopping before releasing the provider.

These are substantive safeguards, not merely comments about reverse teardown.  

Cordis:

ReflectService.provide() does contain a dependency barrier. Its disposer removes the published service, calls notify(), and awaits the affected fibers. Cordis deserves credit for handling the normal reactive-withdrawal case.

However, notify() discovers consumers by walking currently registered runtimes and their fibers. Fiber disposal removes a fiber from its runtime before waiting for its asynchronous unload to complete. I did not find an equivalent global collection of already-removed-but-still-stopping consumers in that notification path.  

There is a second issue: Fiber._unload() starts separate top-level effects through Promise.all(). A service-withdrawal effect and the effect that destroys its backing resource can therefore execute concurrently. Waiting inside the service disposer does not automatically delay the other effect’s resource destruction. 

Verdict: Cordis handles ordinary dependency invalidation, but would not generally prevent your already-stopping-consumer bug. Correct ordering would require additional structure and testing; your explicit stopping maps are stronger in this specific respect.

D. Asynchronous cleanup or callbacks run after a context is dead

Your Markdown kernel:

Context marks itself non-live before teardown, and its event methods enforce liveness. In src/plugins/editor/host.ts, panel onClose emits through that context. In src/plugins/editor/panel.ts, the shell-disposal callback invokes onClose() before calling owned.dispose().

Thus, during parent teardown, an exception from onClose can prevent the panel’s owned cleanup from even being initiated. The parent’s panel-closing effect also does not return the panel-owned cleanup promise.   

Cordis:

Its emit() does not perform the same liveness assertion, so replacing that operation could remove this particular exception. But emit() invokes listeners synchronously without providing a cleanup guarantee if a listener throws. Changing the event implementation would not make “onClose first, cleanup second” structurally safe.

Moreover, Fiber.assertActive() checks whether uid is null, not whether the current activation generation is still valid. A fiber undergoing dependency-driven unload/restart is not necessarily permanently disposed. Detached callbacks from an earlier activation therefore still require an application-level generation or cancellation guard.  

Verdict: one exact dead-context exception might disappear, but Cordis would not automatically prevent the underlying lifetime bug. Cleanup must be guaranteed independently of notifications, and detached asynchronous work must have explicit ownership.

E. Mirrored teardown, LIFO order, and cleanup failures

Your Markdown Context.teardown() and PDF PluginScope.release() await resources sequentially in reverse acquisition order. Both continue attempting other releases after a resource cleanup fails, although their error-reporting mechanisms differ.  

Cordis has two different levels of behavior:

Within one compound ctx.effect(), collected disposers are chained in reverse order. Across separate effects owned by a fiber, _unload() runs them concurrently.

Furthermore, the compound-effect chain uses task.then(dispose), without a per-disposer recovery step. A rejection can skip remaining disposers in that compound group. The outer fiber catches the group failure, but that does not execute the skipped cleanup. 

Verdict: Cordis provides useful effect composition, but not your blanket “every resource is released sequentially in reverse order, despite failures” contract.

F. Transactional activation and service visibility

Your Markdown kernel stages provided services until publish(), validates conflicting publications, and holds child plugins until the parent commits. PDF stages scope.offered until commit() and checks that required provider instances are still the instances captured at activation.   

Cordis gates ordinary declared service dependencies on providers being ACTIVE and retains provider implementations in fiber snapshots. That is meaningful protection against consuming a normally declared service too early.

It does not offer an equivalent general parent transaction: registering a child plugin creates its fiber immediately; a child without a dependency on the parent’s staged service can run while the parent is still initializing. Its registry has no equivalent of your heldUntilCommit mechanism.   

Verdict: partially equivalent service-readiness protection, not equivalent transactional semantics. Neither runtime can undo arbitrary external side effects that were never represented by valid inverse operations.

G. Dependencies, services, manifests, and plugin ordering

Cordis is strongest as a reference here: context isolation, service injection, reactive activation, and caller-aware service behavior are central abstractions. Your Markdown bindCaller hook serves a related purpose, but it is not API-equivalent to Cordis’s traceable-service machinery.   

Important migration differences remain:

Your Markdown required/optional dependency distinction is not directly represented by the inspected Cordis v4 injection map: _refresh() requires all declared injected entries to resolve. Your replaceable provider stacks for vault, resources, and markers also differ from Cordis’s duplicate-provider checks within an isolation scope. Optional-service behavior and override/fallback behavior need explicit redesign, not an import rename.    

Your manifests contain product metadata—capabilities, surfaces, settings, commands, menus, and views—which Cordis’s plugin definition does not replace. Keep them. Also keep dependency validation separate from precedence, as your catalog and plugin graph already do. Neither these manifests nor Cordis should be treated as a sandbox for arbitrary JavaScript plugins.    

Your event API is another real porting cost. Markdown has ranked listeners, an accumulator-style waterfall, and its own bail/error-handling semantics. Cordis uses middleware-style waterfall, different bail conditions, and different exception propagation. Identical method names do not imply identical behavior.  

H. Root shutdown and HMR

Cordis’s root fiber assigns dispose() to restart(). Do not substitute root.fiber.dispose() for your current permanently closing root without defining an application-owned child lifetime and a shutdown barrier. Both extensions currently return awaited teardown from their deactivate() entrypoints; preserve that structure.   

Cordis HMR is a separate package. Its implementation uses filesystem watching, Node module-loader internals, ESM/CJS cache manipulation, and a loader exit path. That is not an esbuild webview HMR solution, and I would not install it into the shared VS Code extension-host process.

Its reload procedure restores module caches if pre-import/validation fails, then unloads old fibers and creates replacements. It explicitly does not roll back a replacement plugin that fails after swapping begins. It is therefore not a general atomic application upgrade mechanism.  

3. Integration cost and risk

Bundle size

The nine Cordis core TypeScript source files total 61,097 bytes according to the repository tree metadata. This includes types, comments, whitespace, and exports; it is not an emitted JavaScript measurement. The core manifest lists cosmokit and @standard-schema/spec as dependencies, with loader/include as optional peers. The Standard Schema references inspected in core are type uses.   

For planning only, I would provision approximately 20–40 KB of minified JavaScript and 8–15 KB gzip for core plus retained utility code, before subtracting deleted kernel code or adding your adapter. This is an engineering estimate from the source surface—not a benchmark or a guaranteed bound.

The net bundle delta remains unknown. It must be measured on a real, non-tree-shaken-away application entrypoint. Importing Cordis in a benchmark and never using it would produce a misleadingly small result.

Startup and browser compatibility

The inspected core files do not directly import Node filesystem, process, or module-loader APIs. The package is ESM and declares sideEffects: false. Core therefore looks suitable for a browser-bundling spike; the Node-specific HMR implementation should not be confused with core compatibility.    

Your PDF build already emits a bundled CommonJS Node host and an IIFE browser viewer. ESM dependency input is not, by itself, a reason to reject the library. Actual compatibility with those build targets, the dependency artifact, and webview CSP still needs execution. 

I cannot responsibly infer startup milliseconds from source bytes. Cordis uses proxies, traceable contexts, and stack capture around effects, so registration and hot service-call costs should be measured separately from module parsing.  

An important PDF distinction

Your five PDF plugins are extension-host features. The browser viewer already uses EmbedPDF’s own plugin-registration system. Cordis would not replace those registrations or the React integration; it would be an additional outer lifetime layer.   

Likewise, keep the bridge controller’s serialized start/stop queue and server-specific shutdown protocol. A runtime can own their returned disposer, but it cannot infer how to close HTTP connections, remove discovery files, or bound outstanding requests.  

The PDF render session illustrates the contract issue independently of either plugin kernel. dispose() snapshots currently tracked stops, while an engine still being created can arrive later and trigger another stop. That is not a completion barrier covering every in-flight creation. It may be acceptable under a cancellation contract, but it is not full quiescence. Cordis adoption alone would not settle that distinction. 

Strict TypeScript

Both projects use exactOptionalPropertyTypes, noUncheckedIndexedAccess, strict mode, and skipLibCheck. Do not weaken those settings to accommodate a runtime migration.  

Consuming built JavaScript and declarations is a different proposition from compiling vendored Cordis source under your flags. The inspected source constructs objects with explicitly undefined optional properties—for example, event options and registry runtime metadata—which require attention under your configuration. This is manageable adapter/vendor work, not evidence that the built package necessarily fails your typecheck.  

API stability, pinning, and vendoring

The current core README explicitly states that the API is unstable and may change without notice; official documentation is still under construction. Treat that as a real maintenance cost. 

For a spike, pin an exact package version and lockfile, including transitive resolutions. Record the audited source commit separately. Do not use a caret range or assume that a package manifest’s version proves artifact/source identity.

For a maintained fork, vendor only the needed core at commit 518b8bc8a390c212c6b0e0db5bc5e2e36b5ab58e, retain upstream notices, build it through an isolated package configuration, and keep a small, explicit patch series. Avoid private fields and internal events in your application-facing API.

Vendoring freezes change; it does not transfer responsibility for your lifecycle patches to upstream.

License

Cordis itself is MIT licensed. Its license permits modification and redistribution subject to retaining the copyright and permission notice. Preserve dependency notices as well; I did not perform a complete transitive licensing audit of a built artifact. 

4. Concrete plan, effort, and pass/fail gates

Recommended immediate work: specify and test the lifecycle contract

Budget two to four engineer-days for a runtime-independent conformance suite and the first targeted fixes. This is an estimate, not a claim about work already completed.

Specify these separately:

Ownership: every acquired resource has an owner.

Completion: a resource remains represented until its release settles, even after it stops being usable.

Dependency safety: provider backing resources outlive all consumers that are still stopping.

Cancellation: stopping initialization prevents publication and invalidates stale continuations.

Quiescence: a returned drain promise accounts for the tasks the runtime actually owns.

Do not promise both “shutdown never waits for an uncooperative initialization” and “all work initiated by that initialization has finished” without cancellation support or an explicit incomplete-drain outcome. Your existing PDF runtime deliberately chooses nonblocking cancellation; Cordis’s ordinary fiber initialization path makes a different tradeoff.

For your current implementation, prioritize a shared release-completion primitive used by normal disposal, early release, and rollback. Retain releasing resources or their promises until settlement. Preserve the dependency-stopping barriers. Make panel-owned cleanup unconditional and observable. This can be shared implementation code while the two extensions remain separate products.

Five-day Cordis spike

The spike is a falsification exercise, not the start of an irrevocable port.

Day 1: lifecycle conformance.

Implement adapters for the Markdown kernel, PDF kernel, and pinned Cordis. Use deferred promises to control ordering, not sleeps.

Cover early release followed by parent disposal; concurrent disposal callers; rollback versus disposal; already-stopping consumers; provider replacement during initialization; failed cleanup followed by more cleanup; stale callbacks after restart; permanent application shutdown; and engine creation that finishes after cancellation.

A Cordis failure on any mandatory invariant blocks production adoption. Do not change the expected behavior just to obtain parity.

Day 2: representative integration.

Port a small vertical slice: PDF pdf and agentBridge; Markdown editor/panel ownership and lineNumbers, plus one caller-owned registration service.

These exercise provider/consumer teardown, real asynchronous shutdown, separate panel roots, CodeMirror extensions, and reconfiguration. lineNumbers is useful because it has an actual compartment-based reconfigure path, not just activation/disposal.   

Day 3: packaging and performance.

Build the existing production host and browser formats. Preserve lazy loading of the PDF bridge server. Emit esbuild metadata and record raw/minified/gzip bytes per entrypoint.

Measure module initialization, registration/activation of the representative graph, first editor readiness, and first PDF readiness separately.

Day 4: adversarial integration and existing tests.

Keep the existing behavior assertions, including Markdown’s feature lifecycle/composition tests and PDF’s runtime tests. Test fixtures may change where they inspect private kernel representation; expected lifecycle outcomes must not be weakened.  

Run 10,000 seeded schedules of 100 operations over small dependency graphs, with controlled asynchronous gates and injected failures. Persist failing seeds and event traces. Include independent observations—open handles, registrations, engine instances—not just the runtime’s own ledger.

Day 5: decision and deletion accounting.

Count removed first-party lifecycle logic, new adapter logic, and maintained vendor patches. Moving your state machine into an adapter is not a successful replacement.

Proposed measurable gates

Correctness: zero violations of mandatory completion, ordering, cancellation, and cleanup-continuation invariants; zero unhandled rejections; all migrated behavior tests pass.

Simplification: at least 50% net reduction in first-party lifecycle implementation for the replaced slice, with an adapter target of no more than 300 nonblank production lines. Count lifecycle vendor patches as maintained code. Fail the simplification gate if you need to recreate your dependency scheduler, stopping registry, and rollback engine alongside Cordis.

Bundle: no more than 40 KB additional minified JavaScript or 15 KB gzip per affected webview entrypoint, and no accidental inclusion of loader/HMR/CLI or the lazy MCP server.

Startup: over at least 50 runs on fixed target machines, no more than 5 ms added at the 95th percentile for host runtime initialization, 2 ms for webview runtime initialization, and 5% for overall editor-ready or first-page-ready latency. These are proposed engineering budgets, not measured Cordis results.

Compatibility: existing strict TypeScript settings remain; production CommonJS host and browser IIFE builds succeed; representative integration works in both VS Code and Cursor with the real webview CSP.

Given the inspected source, I expect the unmodified Cordis implementation to fail the correctness gate before performance becomes decisive.

Conditional migration after a successful spike

Only proceed if the failures are fixed upstream or in a deliberately accepted, small fork.

First migrate extension-host lifetimes, preserving your manifests, plugin identities, separate roots, and awaited deactivate() paths. Budget approximately one to two engineer-weeks.

Then migrate Markdown webview services and plugin definitions, preserving precedence, optional-service behavior, reconfiguration, and caller ownership. Keep PDF’s EmbedPDF/React runtime and use any new outer scope only for application-owned lifetimes. Budget another one to two engineer-weeks.

Finally run the complete catalog, browser, native-editor, shutdown, and performance suites. Budget roughly another week. My overall planning range is approximately four to six engineer-weeks including the spike, with high uncertainty until the semantic adapter is demonstrated.

Being unpublished and having no compatibility requirement helps considerably. It does not make the lifecycle semantics mechanical.

5. What I could not verify

I did not execute either repository’s full tests, build a Cordis-backed version, measure emitted bundle deltas, or benchmark startup in VS Code/Cursor. Dependency retrieval was unavailable in the execution environment. The bundle numbers above are estimates and the performance numbers are proposed gates.

I inspected Cordis’s core implementation and HMR path; your kernel implementations, catalogs and manifest model; the Markdown host/panel paths and representative plugins; all five PDF plugin entrypoints; the bridge controller/server; the PDF engine/session integration; and focused tests. This was not a line-by-line audit of every rendering module in all 42 Markdown plugins.

I also could not verify the exact historical numbering of all four review rounds, whether additional fixes exist on another branch, the published npm artifact’s identity with this commit, or future upstream maintenance responsiveness.

Bottom line

Do not replace the kernels merely because Cordis formalizes the same ideas. The inspected implementation does not eliminate the concurrency obligations that have caused your repeated bugs.

Use Cordis to improve the specification and challenge the tests. Fix the joinable-release and stopping-lifetime model first. Reconsider production adoption only when a pinned implementation passes those tests while actually deleting—not relocating—the difficult lifecycle machinery.