import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ScenarioFixture,
  checkpoint,
  defaultCleanupTimeoutMs,
  describeError,
} from "./fixture";
import type { HarnessFactory } from "./harness";
import { lifecycleScenarios } from "./scenarios";
import type { LifecycleScenario } from "./scenarios";

/** The scenario body did not settle within its own bound. Never a pass. */
export class ScenarioTimeoutError extends Error {
  override readonly name = "ScenarioTimeoutError";
  constructor(id: string, milliseconds: number) {
    super(`scenario "${id}" did not settle within ${milliseconds}ms`);
  }
}

/** The node:test context aborted (e.g. its own timeout). Never a pass. */
export class ScenarioAbortedError extends Error {
  override readonly name = "ScenarioAbortedError";
  constructor(id: string, reason: unknown) {
    super(`scenario "${id}" aborted by test context: ${describeError(reason)}`);
  }
}

export interface RunOptions {
  readonly signal?: AbortSignal | undefined;
  readonly scenarioTimeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
}

export const defaultScenarioTimeoutMs = 5000;

export function leafErrors(error: unknown): unknown[] {
  return error instanceof AggregateError
    ? error.errors.flatMap((inner: unknown) => leafErrors(inner))
    : [error];
}

/**
 * Runs one scenario so that it always unwinds: the body races its own timer
 * and the test-context signal; on expiry the fixture is aborted (gates open,
 * new work refused) and cleanup runs with its own bound. The process listener
 * is always removed. Scenario, cleanup and rejection-monitor failures are
 * reported together (F4): one error is rethrown as is, several as an
 * AggregateError whose first entry is the original scenario failure.
 */
export async function runScenario(
  scenario: LifecycleScenario,
  factory: HarnessFactory,
  options: RunOptions = {},
): Promise<void> {
  const scenarioTimeoutMs =
    options.scenarioTimeoutMs ?? defaultScenarioTimeoutMs;
  const unhandled: unknown[] = [];
  const record = (error: unknown) => {
    unhandled.push(error);
  };
  process.on("unhandledRejection", record);
  const failures: unknown[] = [];
  const fixture = new ScenarioFixture(
    factory,
    options.cleanupTimeoutMs ?? defaultCleanupTimeoutMs,
  );
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    try {
      const body = Promise.resolve().then(() => scenario.run(fixture));
      // An abandoned body may still reject later (e.g. FixtureClosedError).
      void body.catch(() => undefined);
      const stop = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          fixture.abort();
          reject(new ScenarioTimeoutError(scenario.id, scenarioTimeoutMs));
        }, scenarioTimeoutMs);
        const signal = options.signal;
        if (signal) {
          onAbort = () => {
            fixture.abort();
            reject(new ScenarioAbortedError(scenario.id, signal.reason));
          };
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }
      });
      await Promise.race([body, stop]);
    } catch (error) {
      failures.push(error);
    } finally {
      clearTimeout(timer);
      if (onAbort) {
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
    try {
      await fixture.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      await checkpoint();
      assert.deepEqual(
        unhandled,
        [],
        "zero unhandled rejections across activation, cancellation and cleanup",
      );
    } catch (error) {
      failures.push(error);
    }
  } finally {
    process.off("unhandledRejection", record);
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      `scenario "${scenario.id}" failed ${failures.length} ways: ${failures
        .map((failure) => describeError(failure))
        .join(" | ")}`,
      { cause: failures[0] },
    );
  }
}

interface SuiteOptions {
  readonly name: string;
  readonly factory: HarnessFactory;
  readonly earlyRelease: boolean;
  readonly skips?: Readonly<Record<string, string>>;
}

export function runLifecycleSuite(options: SuiteOptions): void {
  describe(
    `${options.name} lifecycle conformance`,
    { concurrency: false },
    () => {
      for (const scenario of lifecycleScenarios) {
        const skip =
          options.skips?.[scenario.id] ??
          (scenario.needsEarlyRelease && !options.earlyRelease
            ? "N/A: PluginScope.acquire returns a resource, not an early-release handle"
            : false);
        test(
          `${scenario.id}: ${scenario.expectation}`,
          // Node's timeout is a backstop above scenario + cleanup bounds.
          { skip, timeout: 15000 },
          async (t) => {
            await runScenario(scenario, options.factory, {
              signal: t.signal,
            });
          },
        );
      }
    },
  );
}
