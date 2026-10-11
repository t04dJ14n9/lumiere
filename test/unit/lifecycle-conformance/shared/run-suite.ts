import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ScenarioFixture, checkpoint } from "./fixture";
import type { HarnessFactory } from "./harness";
import { lifecycleScenarios } from "./scenarios";

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
          { skip, timeout: 10000 },
          async () => {
            const unhandled: unknown[] = [];
            const record = (error: unknown) => {
              unhandled.push(error);
            };
            process.on("unhandledRejection", record);
            const fixture = new ScenarioFixture(options.factory);
            try {
              await scenario.run(fixture);
            } finally {
              try {
                await fixture.close();
                await checkpoint();
                assert.deepEqual(
                  unhandled,
                  [],
                  "zero unhandled rejections across activation, cancellation and cleanup",
                );
              } finally {
                process.off("unhandledRejection", record);
              }
            }
          },
        );
      }
    },
  );
}
