# Markdown lifecycle conformance — Stage A

The normal unit entrypoint runs the shared Stage 1 scenarios against two live
adapters. There are no expected failures in either row:

| Adapter | PASS | N/A | Failure |
| --- | ---: | ---: | ---: |
| Markdown native | 23 | 0 | 0 |
| cordis-shim (`cordis@4.0.0-rc.10`) | 23 | 0 | 0 |

`cordis-shim-adapter.ts` only maps harness specs/calls to the reusable
[`CordisApplication`](../../../src/kernel-cordis/README.md). The adapter owns
no lifecycle mechanisms. Both adapters also run the four harness isolation
meta-tests. The historical `shared/cordis-stub.ts` remains in the Stage 1
snapshot but is not executed. Do not run the external `sync.py` here: it can
overwrite other worktrees and import the Stage 2a known-failure runner. Stage A
needs neither assertion changes nor known-failure classification.

Stage 2a's separate stock-Cordis characterization recorded 5 passes and 18
known failures (including early release). On this shim row all 23 pass:

| Historical failure | Passing scenarios on the shim |
| --- | --- |
| A: repeated dispose/early release did not join | concurrent-disable, concurrent-dispose, early-release-parent-dispose |
| B/D: blocked apply, late inverse ownership | cancel-{disable,dispose}, late-drain-{disable,dispose}-{success,error}, stale-activation-after-cancel, no-unhandled-rejections |
| C/E: backing released before consumers finish | provider-restart, already-stopping-dependent, transitive-provider-disable, provider-replaced-during-activation |
| E: concurrent rollback unload | rollback-{disable,dispose}-{success,error} |

Permanent shutdown also uses a real app child and the reusable class's closed
API, tested directly through Cordis registry removal. Production stays native;
the new code is not imported from `src/host/extension.ts` or product plugins.

```sh
pnpm exec tsx --test test/unit/lifecycle-conformance.test.ts test/unit/cordis-shim.test.ts
```
