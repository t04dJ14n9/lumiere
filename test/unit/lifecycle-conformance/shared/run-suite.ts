import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CleanupTimeoutError,
  FixtureClosedError,
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

/** Infrastructure failures: they can never satisfy Passed or Known failure. */
export function isInfrastructureError(error: unknown): boolean {
  return (
    error instanceof ScenarioTimeoutError ||
    error instanceof ScenarioAbortedError ||
    error instanceof CleanupTimeoutError ||
    error instanceof FixtureClosedError
  );
}

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

/** Characterization outcome per scenario (Stage 2 taxonomy). */
export type Expectation =
  | { readonly kind: "pass" }
  | {
      readonly kind: "knownFailure";
      /** Invariant violated, for the results matrix. */
      readonly invariant: string;
      /** Must match the first line of a specific assertion message. */
      readonly assertion: RegExp;
    }
  | { readonly kind: "notEvaluated"; readonly reason: string };

/**
 * Known failure is satisfied only by an AssertionError whose message matches
 * the recorded assertion, with no infrastructure error (timeout, abort,
 * cleanup timeout, closed fixture) anywhere in the failure. A scenario that
 * now passes fails loudly so the matrix gets updated.
 */
export async function expectKnownFailure(
  run: Promise<void>,
  expectation: Extract<Expectation, { kind: "knownFailure" }>,
): Promise<void> {
  let caught: unknown;
  try {
    await run;
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught !== undefined,
    `known failure (${expectation.invariant}) no longer reproduces; update the characterization matrix`,
  );
  const leaves = leafErrors(caught);
  const infrastructure = leaves.filter(isInfrastructureError);
  if (infrastructure.length) {
    throw new AggregateError(
      leaves,
      `infrastructure error cannot satisfy a known failure: ${infrastructure.map(describeError).join(" | ")}`,
    );
  }
  const matched = leaves.some(
    (leaf) =>
      leaf instanceof assert.AssertionError &&
      // Node appends an actual/expected diff after the custom message.
      expectation.assertion.test(leaf.message.split("\n")[0] ?? ""),
  );
  if (!matched) {
    throw new AggregateError(
      leaves,
      `failure did not match recorded assertion ${String(expectation.assertion)}: ${leaves.map(describeError).join(" | ")}`,
    );
  }
}

interface SuiteOptions {
  readonly name: string;
  readonly factory: HarnessFactory;
  readonly earlyRelease: boolean;
  readonly skips?: Readonly<Record<string, string>>;
  readonly expectations?: Readonly<Record<string, Expectation>>;
}

export function runLifecycleSuite(options: SuiteOptions): void {
  describe(
    `${options.name} lifecycle conformance`,
    { concurrency: false },
    () => {
      for (const scenario of lifecycleScenarios) {
        const expectation = options.expectations?.[scenario.id];
        const skip =
          options.skips?.[scenario.id] ??
          (expectation?.kind === "notEvaluated"
            ? `Not evaluated: ${expectation.reason}`
            : undefined) ??
          (scenario.needsEarlyRelease && !options.earlyRelease
            ? "N/A: PluginScope.acquire returns a resource, not an early-release handle"
            : false);
        const label =
          expectation?.kind === "knownFailure"
            ? `[known failure: ${expectation.invariant}] `
            : "";
        test(
          `${label}${scenario.id}: ${scenario.expectation}`,
          // Node's timeout is a backstop above scenario + cleanup bounds.
          { skip, timeout: 15000 },
          async (t) => {
            const run = runScenario(scenario, options.factory, {
              signal: t.signal,
            });
            if (expectation?.kind === "knownFailure") {
              await expectKnownFailure(run, expectation);
            } else {
              await run;
            }
          },
        );
      }
    },
  );
}
