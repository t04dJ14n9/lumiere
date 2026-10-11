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

/** Failed assertions still open every gate and drain the runtime and callers. */
export class ScenarioFixture {
  private readonly gates: DeferredGate[] = [];
  private readonly operations: Promise<unknown>[] = [];
  private readonly expectedErrors: string[] = [];
  private runtime: LifecycleHarness | undefined;

  constructor(private readonly factory: HarnessFactory) {}

  gate(): DeferredGate {
    const gate = deferredGate();
    this.gates.push(gate);
    return gate;
  }

  create(plugins: readonly PluginSpec[]): LifecycleHarness {
    assert.equal(this.runtime, undefined, "one runtime per scenario");
    this.runtime = this.factory(plugins);
    return this.runtime;
  }

  expectErrors(...messages: string[]): void {
    this.expectedErrors.push(...messages);
  }

  watch<T>(work: Promise<T>): ObservedOperation<T> {
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

  async close(): Promise<void> {
    for (const gate of this.gates) {
      gate.open();
    }
    await this.runtime?.dispose();
    const outcomes = await Promise.allSettled(this.operations);
    const failures = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );
    assert.deepEqual(failures, [], "lifecycle callers must not reject");
    const unexpectedErrors = (this.runtime?.errors ?? []).filter(
      (error) =>
        !this.expectedErrors.some((message) => error.includes(message)),
    );
    assert.deepEqual(
      unexpectedErrors,
      [],
      "unexpected runtime cleanup/activation error",
    );
    await checkpoint();
  }
}
