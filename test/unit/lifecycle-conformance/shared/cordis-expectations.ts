import type { Expectation } from "./run-suite";

const pass: Expectation = { kind: "pass" };
const known = (invariant: string, assertion: RegExp): Expectation => ({
  kind: "knownFailure",
  invariant,
  assertion,
});

const joinStop = known(
  "concurrent stop callers join one release (memo risk A: repeated disposer returns immediately)",
  /^every concurrent stop caller must stay pending behind the in-flight release$/,
);
const cancelWithoutWaiting = known(
  "stop cancels a gated activation without awaiting it (memo risk B: unload waits for inertia)",
  /^stop must begin releasing acquired resources without waiting for the gated activation$/,
);
const lifoRollback = known(
  "rollback releases LIFO (memo risk E: separate effects unload concurrently)",
  /^rollback releases newer resources before older ones \(LIFO\)$/,
);

/**
 * Characterization of cordis@4.0.0-rc.10 through the public-API adapter,
 * recorded 2026-10-12. Each known failure names the first violated invariant
 * and must fail with exactly that assertion; later invariants in the same
 * scenario are therefore not evaluated on Cordis (see results doc).
 */
export const cordisExpectations: Readonly<Record<string, Expectation>> = {
  "concurrent-enable": pass,
  "concurrent-disable": joinStop,
  "concurrent-dispose": joinStop,
  "provider-restart": known(
    "provider backing outlives a stopping consumer on restart (memo risk C/E)",
    /^provider must not release backing while its consumer is still stopping$/,
  ),
  "already-stopping-dependent": known(
    "provider waits for an already-stopping dependent (memo risk C)",
    /^provider must not release while an already-stopping dependent runs$/,
  ),
  "cancel-disable": cancelWithoutWaiting,
  "cancel-dispose": cancelWithoutWaiting,
  "late-drain-disable-success": cancelWithoutWaiting,
  "late-drain-disable-error": cancelWithoutWaiting,
  "late-drain-dispose-success": cancelWithoutWaiting,
  "late-drain-dispose-error": cancelWithoutWaiting,
  "rollback-disable-success": lifoRollback,
  "rollback-disable-error": lifoRollback,
  "rollback-dispose-success": lifoRollback,
  "rollback-dispose-error": lifoRollback,
  "cleanup-continuation": pass,
  "dependency-and-lifo-order": pass,
  "transitive-provider-disable": known(
    "transitive withdrawal keeps backing alive until the leaf stops (memo risk C/E)",
    /^no backing is released while the transitive leaf is still stopping$/,
  ),
  "early-release-parent-dispose": known(
    "repeated early release and parent disposal join the in-flight inverse (memo risk A)",
    /^repeated early release and parent disposal must join the in-flight inverse$/,
  ),
  "stale-activation-after-cancel": known(
    "disable completes without awaiting a cancelled activation (memo risk B)",
    /^disable must complete without waiting for the cancelled activation$/,
  ),
  "provider-replaced-during-activation": known(
    "provider withdrawal does not await a dependent's unfinished activation (memo risk B/C)",
    /^provider disable must complete without waiting for a dependent's unfinished activation$/,
  ),
  "permanent-shutdown": pass,
  "no-unhandled-rejections": known(
    "a refused late acquisition still runs its inverse (memo risk D: INACTIVE_EFFECT throws before collecting)",
    /^late resource inverse is invoked immediately when acquire is refused$/,
  ),
};
