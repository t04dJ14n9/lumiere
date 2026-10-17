import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CleanupTimeoutError, FixtureClosedError } from "./fixture";
import type { HarnessFactory } from "./harness";
import {
  ScenarioAbortedError,
  ScenarioTimeoutError,
  leafErrors,
  runScenario,
} from "./run-suite";
import { lifecycleScenarios } from "./scenarios";
import type { LifecycleScenario } from "./scenarios";

const listeners = () => process.listenerCount("unhandledRejection");
const fast = { scenarioTimeoutMs: 100, cleanupTimeoutMs: 100 };

function control(): LifecycleScenario {
  const scenario = lifecycleScenarios.find(
    (candidate) => candidate.id === "concurrent-enable",
  );
  assert.ok(scenario);
  return scenario;
}

/** Harness meta-tests (F3/F4) against a native adapter as the control. */
export function runHarnessMetaTests(
  name: string,
  factory: HarnessFactory,
): void {
  describe(`${name} harness isolation (F3/F4)`, { concurrency: false }, () => {
    test("a scenario hung on a gate times out, cleans up, and a later control passes", async () => {
      const baseline = listeners();
      let disposed = false;
      let lateTouch: unknown;
      const hung: LifecycleScenario = {
        id: "meta-hung-gate",
        expectation: "never settles",
        async run(fixture) {
          const runtime = fixture.create([
            { id: "provider", provides: "lifecycleBacking", activate() {} },
          ]);
          const wrapped = runtime.dispose.bind(runtime);
          runtime.dispose = async () => {
            disposed = true;
            await wrapped();
          };
          await runtime.enable("provider");
          const never = fixture.gate();
          // Opened only by fixture.abort(); the continuation is abandoned.
          await never.opened;
          try {
            fixture.gate();
          } catch (error) {
            lateTouch = error;
          }
          await new Promise(() => undefined);
        },
      };
      await assert.rejects(runScenario(hung, factory, fast), (error) => {
        assert.ok(error instanceof ScenarioTimeoutError, String(error));
        return true;
      });
      assert.equal(disposed, true, "runtime disposed after timeout");
      assert.equal(
        listeners(),
        baseline,
        "unhandledRejection listener removed",
      );
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(
        lateTouch instanceof FixtureClosedError,
        "abandoned continuation cannot register new work",
      );
      await runScenario(control(), factory);
      assert.equal(listeners(), baseline);
    });

    test("a runtime whose disposal never resolves fails with a bounded cleanup error, then a control passes", async () => {
      const baseline = listeners();
      const stuck: HarnessFactory = (plugins) => {
        const runtime = factory(plugins);
        return {
          ...runtime,
          errors: runtime.errors,
          dispose: () => new Promise(() => undefined),
        };
      };
      const scenario: LifecycleScenario = {
        id: "meta-stuck-dispose",
        expectation: "dispose never resolves",
        async run(fixture) {
          const runtime = fixture.create([
            { id: "provider", provides: "lifecycleBacking", activate() {} },
          ]);
          await runtime.enable("provider");
        },
      };
      await assert.rejects(runScenario(scenario, stuck, fast), (error) => {
        assert.ok(error instanceof CleanupTimeoutError, String(error));
        return true;
      });
      assert.equal(listeners(), baseline);
      await runScenario(control(), factory);
    });

    test("test-context abort unwinds the scenario and cleanup still runs", async () => {
      const baseline = listeners();
      const controller = new AbortController();
      let disposed = false;
      const scenario: LifecycleScenario = {
        id: "meta-abort",
        expectation: "aborted by signal",
        async run(fixture) {
          const runtime = fixture.create([
            { id: "provider", provides: "lifecycleBacking", activate() {} },
          ]);
          const wrapped = runtime.dispose.bind(runtime);
          runtime.dispose = async () => {
            disposed = true;
            await wrapped();
          };
          setImmediate(() => controller.abort(new Error("node:test timeout")));
          await fixture.gate().opened;
          await new Promise(() => undefined);
        },
      };
      await assert.rejects(
        runScenario(scenario, factory, { signal: controller.signal }),
        (error) => {
          assert.ok(error instanceof ScenarioAbortedError, String(error));
          return true;
        },
      );
      assert.equal(disposed, true);
      assert.equal(listeners(), baseline);
    });

    test("a cleanup error does not mask the original scenario error (F4)", async () => {
      const scenario: LifecycleScenario = {
        id: "meta-masking",
        expectation: "scenario and cleanup both fail",
        async run(fixture) {
          const runtime = fixture.create([
            {
              id: "provider",
              provides: "lifecycleBacking",
              activate(scope) {
                scope.acquire(() => {
                  throw new Error("cleanup boom");
                });
              },
            },
          ]);
          await runtime.enable("provider");
          assert.fail("original scenario failure");
        },
      };
      await assert.rejects(runScenario(scenario, factory, fast), (error) => {
        assert.ok(error instanceof AggregateError, String(error));
        assert.match(error.message, /original scenario failure/);
        assert.match(
          error.message,
          /unexpected runtime cleanup\/activation error/,
        );
        const first = leafErrors(error)[0];
        assert.ok(first instanceof assert.AssertionError);
        assert.equal(first.message, "original scenario failure");
        assert.equal((error as Error).cause, error.errors[0]);
        return true;
      });
    });
  });
}
