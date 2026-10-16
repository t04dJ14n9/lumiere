import type { HarnessFactory } from "./harness";
import { lifecycleScenarios } from "./scenarios";

export const intendedCordisVersion = "4.0.0-rc.10";
export const cordisStubReason = `Stage 1 skeleton: public-API lifecycle adapter for cordis@${intendedCordisVersion} is not implemented`;

/**
 * Runnable, deliberately unavailable adapter endpoint. It never emulates a
 * native scheduler or claims that an unexecuted Cordis invariant passed.
 * Replace this factory with a public-API adapter and remove skips individually
 * when the pinned artifact can be installed and tested. Production is untouched.
 */
export const createCordisStub: HarnessFactory = (_plugins) => ({
  errors: [],
  async enable() {
    throw new Error(cordisStubReason);
  },
  async disable() {
    throw new Error(cordisStubReason);
  },
  async restart() {
    throw new Error(cordisStubReason);
  },
  async dispose() {
    /* The skeleton has acquired nothing. */
  },
  state: () => "inactive",
  service: () => undefined,
});

export const cordisSkipReasons: Readonly<Record<string, string>> =
  Object.fromEntries(
    lifecycleScenarios.map((scenario) => [
      scenario.id,
      `${cordisStubReason}; pending verification: ${scenario.expectation}`,
    ]),
  );
