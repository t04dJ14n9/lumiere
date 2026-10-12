/**
 * Cordis reference-only tracking target (opt-in, NOT part of `pnpm test` / `pnpm check`).
 *
 * Production keeps the native lifecycle kernel. cordis@4.0.0-rc.10 is pinned as a
 * test-only differential reference: each recorded known failure (see
 * shared/cordis-expectations.ts) passes as "expected fail"; if upstream fixes one,
 * that scenario starts passing and this target fails, flagging the change.
 *
 * Run: pnpm test:cordis-reference
 */
import { createCordisHarness } from "../unit/lifecycle-conformance/shared/cordis-adapter";
import { cordisExpectations } from "../unit/lifecycle-conformance/shared/cordis-expectations";
import { runLifecycleSuite } from "../unit/lifecycle-conformance/shared/run-suite";

runLifecycleSuite({
  name: "cordis@4.0.0-rc.10 (reference, tracking)",
  factory: createCordisHarness,
  earlyRelease: true,
  expectations: cordisExpectations,
});
