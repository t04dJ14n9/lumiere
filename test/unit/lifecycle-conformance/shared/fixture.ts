import assert from "node:assert/strict";
import { deferredGate } from "./harness";
import type {
  DeferredGate,
  HarnessFactory,
  LifecycleHarness,
  PluginSpec,
} from "./harness";

export interface ObservedOperation<T> {
  readonly done: Promise<T>;
  settled: boolean;
}

/** One event-loop turn, not a timed delay or a lifecycle ordering gate. */
export function checkpoint(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Raised when an abandoned scenario continuation touches a closed fixture. */
export class FixtureClosedError extends Error {
  override readonly name = "FixtureClosedError";
  constructor(action: string) {
    super(`fixture is closed; refusing ${action} from an abandoned scenario`);
  }
}

/** Infrastructure failure: cleanup did not settle within its own bound. */
export class CleanupTimeoutError extends Error {
  override readonly name = "CleanupTimeoutError";
  constructor(step: string, milliseconds: number) {
    super(
      `fixture cleanup step "${step}" did not settle within ${milliseconds}ms`,
    );
  }
}

/** Resolves with the work, or rejects with CleanupTimeoutError; never hangs. */
export function bounded<T>(
  work: Promise<T>,
  step: string,
  milliseconds: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new CleanupTimeoutError(step, milliseconds)),
      milliseconds,
    );
  });
  // An abandoned rejection of `work` after expiry must stay observed.
  void work.catch(() => undefined);
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

export const defaultCleanupTimeoutMs = 2000;

/**
 * Failed, timed-out or aborted scenarios still open every gate and drain the
 * runtime and callers. `close()` is idempotent and bounded; after `abort()` the
 * fixture refuses new gates, runtimes and watched operations so an abandoned
 * continuation cannot register work behind the cleanup barrier.
 */
export class ScenarioFixture {
  private readonly gates: DeferredGate[] = [];
  private readonly operations: Promise<unknown>[] = [];
  private readonly expectedErrors: string[] = [];
  private runtime: LifecycleHarness | undefined;
  private closing: Promise<void> | undefined;
  private aborted = false;

  constructor(
    private readonly factory: HarnessFactory,
    private readonly cleanupTimeoutMs = defaultCleanupTimeoutMs,
  ) {}

  get closed(): boolean {
    return this.aborted;
  }

  gate(): DeferredGate {
    if (this.aborted) {
      throw new FixtureClosedError("gate()");
    }
    const gate = deferredGate();
    this.gates.push(gate);
    return gate;
  }

  create(plugins: readonly PluginSpec[]): LifecycleHarness {
    if (this.aborted) {
      throw new FixtureClosedError("create()");
    }
    assert.equal(this.runtime, undefined, "one runtime per scenario");
    this.runtime = this.factory(plugins);
    return this.runtime;
  }

  expectErrors(...messages: string[]): void {
    this.expectedErrors.push(...messages);
  }

  watch<T>(work: Promise<T>): ObservedOperation<T> {
    if (this.aborted) {
      void work.catch(() => undefined);
      throw new FixtureClosedError("watch()");
    }
    const operation: ObservedOperation<T> = {
      settled: false,
      done: work.then(
        (value) => {
          operation.settled = true;
          return value;
        },
        (error: unknown) => {
          operation.settled = true;
          throw error;
        },
      ),
    };
    // Observe caller promises immediately. Unexpected failures are asserted at
    // drain, while the process listener still detects detached runtime failures.
    void operation.done.catch(() => undefined);
    this.operations.push(operation.done);
    return operation;
  }

  /** Synchronous: stop accepting work and release every gate. Idempotent. */
  abort(): void {
    this.aborted = true;
    for (const gate of this.gates) {
      gate.open();
    }
  }

  /** Idempotent and bounded; repeated callers join the first cleanup. */
  close(): Promise<void> {
    this.closing ??= this.drain();
    return this.closing;
  }

  private async drain(): Promise<void> {
    this.abort();
    const failures: unknown[] = [];
    try {
      await bounded(
        Promise.resolve().then(() => this.runtime?.dispose()),
        "runtime.dispose()",
        this.cleanupTimeoutMs,
      );
    } catch (error) {
      failures.push(error);
    }
    try {
      const outcomes = await bounded(
        Promise.allSettled(this.operations),
        "lifecycle callers",
        this.cleanupTimeoutMs,
      );
      const rejected = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );
      assert.deepEqual(rejected, [], "lifecycle callers must not reject");
    } catch (error) {
      failures.push(error);
    }
    try {
      const unexpectedErrors = (this.runtime?.errors ?? []).filter(
        (error) =>
          !this.expectedErrors.some((message) => error.includes(message)),
      );
      assert.deepEqual(
        unexpectedErrors,
        [],
        "unexpected runtime cleanup/activation error",
      );
    } catch (error) {
      failures.push(error);
    }
    await checkpoint();
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        `fixture cleanup failed ${failures.length} ways: ${failures
          .map((failure) => describeError(failure))
          .join(" | ")}`,
      );
    }
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message.split("\n")[0]}`;
  }
  return String(error);
}
