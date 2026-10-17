# Cordis lifetime shim

`CordisApplication` is an application-owned **child** of a Cordis context.
Stage A exercised it from conformance tests only. Stage B selects it from
production via `CordisPluginRuntime` in `../cordis-runtime.ts` when
`pdfWorkshop.runtimeImpl` (or `PDF_WORKSHOP_RUNTIME_IMPL`) is `cordis`.
Default remains `native` (`PluginRuntime`).

Cordis owns plugin registration, injected-service gating, service publication
and lookup, and fiber load/unload transitions. The shim uses only its public
APIs (`Context`, `plugin`, `effect`, `provide`, `get`, `Fiber.await/dispose`,
and logger exporters). No Cordis internals are patched. Definitions declare
unique service ownership and an acyclic required-provider graph; required
providers must declare at least one service. Optional edges affect disable /
dispose ordering only (not Cordis inject). Services are staged until apply
returns, then published through Cordis while its fiber is still loading.

The application adds the completion behavior missing from stock rc.10:

- `Lifetime` owns one resource stack in one Cordis effect. Each inverse has a
  joinable handle installed before user code runs. Unload awaits each inverse
  in LIFO order and reports errors once while continuing through the stack.
- Stop races the application initializer against cancellation. Cordis can
  finish unloading without awaiting an uncooperative initializer; the original
  enable caller still observes application completion. The stopped scope
  refuses publication and immediately runs every refused acquisition's inverse.
  A tracked set joins successive waves of late inverses until it is empty.
- A global stopping map retains consumers through cleanup. Provider disable
  recursively starts and joins transitive consumers (required and optional),
  including ones another caller is already stopping, before disposing the
  provider fiber. Enables wait for relevant withdrawal barriers. The graph
  only orders withdrawal; Cordis performs injection and activation gating.
- Shutdown closes the application API synchronously, joins stops, disposes
  the real child fiber, and removes its logger exporter. It never disposes or
  restarts the infrastructure root. Both enable and restart refuse reopening.

Cancellation cannot terminate arbitrary JavaScript. Work that never returns
can retain its closure, and inverses that never finish still hold up shutdown.
A completed stop cannot wait for acquisitions made in the future; those
acquisitions are refused, immediately released, and their failures observed.
Late inverses arriving during a drain are joined, including subsequent waves.
The supplied error reporter is expected to return normally.

## Enable Cordis for unpackaged Extension Host

```sh
# Env (wins over setting): rebuild, then F5 / test:vscode
PDF_WORKSHOP_RUNTIME_IMPL=cordis pnpm build
# or in user/workspace settings.json:
# "pdfWorkshop.runtimeImpl": "cordis"
# then Developer: Reload Window
```

Confirm the PDF Workshop log line `runtimeImpl=cordis` after activation.

## Audited dependency

`cordis` is an exact **dependency** at `4.0.0-rc.10` (production path when the
flag selects cordis; still unused when default native). The lock resolves its
dependencies to `cosmokit@1.8.1` and `@standard-schema/spec@1.1.0`. The
include/loader peers are optional and not installed. No PoC/fork paths.

```text
sha1: cdc1b3398c2d9378afda6d4c4098edbf286f9f34
integrity: sha512-xG90nPNQxR272cC4lR/m5LHevegIJvdddQBlKdEAdGz3n+zgH5lsgkg8o9fc2P3T/f+pO5D7FN1HZvkNBiABnw==
```

```sh
pnpm exec tsx --test test/unit/lifecycle-conformance.test.ts test/unit/cordis-shim.test.ts test/unit/cordis-runtime.test.ts
```
