import assert from "node:assert/strict";
import { checkpoint } from "./fixture";
import type { ScenarioFixture } from "./fixture";
import type { ActivationScope, BackingService, PluginSpec } from "./harness";

export interface LifecycleScenario {
  readonly id: string;
  readonly expectation: string;
  readonly needsEarlyRelease?: boolean;
  run(fixture: ScenarioFixture): Promise<void>;
}

function provider(activate: PluginSpec["activate"]): PluginSpec {
  return { id: "provider", provides: "lifecycleBacking", activate };
}

function consumer(activate: PluginSpec["activate"]): PluginSpec {
  return { id: "consumer", requires: ["provider"], activate };
}

function backing(generation = 1): BackingService {
  return { generation, read: () => generation };
}

const concurrentEnable: LifecycleScenario = {
  id: "concurrent-enable",
  expectation:
    "concurrent enable joins one activation and neither caller finishes early",
  async run(fixture) {
    const entered = fixture.gate();
    const finish = fixture.gate();
    let activations = 0;
    const runtime = fixture.create([
      provider(async (scope) => {
        activations++;
        scope.provide("lifecycleBacking", backing());
        entered.open();
        await finish.opened;
      }),
    ]);
    const first = fixture.watch(runtime.enable("provider"));
    await entered.opened;
    const second = fixture.watch(runtime.enable("provider"));
    await checkpoint();
    assert.equal(activations, 1);
    assert.equal(first.settled, false);
    assert.equal(second.settled, false);
    assert.equal(runtime.service("lifecycleBacking"), undefined);
    finish.open();
    await Promise.all([first.done, second.done]);
    assert.equal(runtime.state("provider"), "active");
    assert.equal(runtime.service("lifecycleBacking")?.generation, 1);
  },
};

function concurrentStop(stop: "disable" | "dispose"): LifecycleScenario {
  return {
    id: `concurrent-${stop}`,
    expectation: `all concurrent ${stop} callers join the same asynchronous release`,
    async run(fixture) {
      const entered = fixture.gate();
      const finish = fixture.gate();
      let released = 0;
      const runtime = fixture.create([
        provider((scope) => {
          scope.acquire(async () => {
            entered.open();
            await finish.opened;
            released++;
          });
        }),
      ]);
      await runtime.enable("provider");
      const stopping = () =>
        stop === "dispose" ? runtime.dispose() : runtime.disable("provider");
      const first = fixture.watch(stopping());
      await entered.opened;
      const second = fixture.watch(stopping());
      const third = fixture.watch(stopping());
      await checkpoint();
      assert.deepEqual(
        [first.settled, second.settled, third.settled],
        [false, false, false],
      );
      finish.open();
      await Promise.all([first.done, second.done, third.done]);
      assert.equal(released, 1);
      assert.equal(runtime.state("provider"), "inactive");
    },
  };
}

const providerRestart: LifecycleScenario = {
  id: "provider-restart",
  expectation:
    "consumer teardown finishes before a restarted consumer uses replacement backing",
  async run(fixture) {
    const entered = fixture.gate();
    const finish = fixture.gate();
    const log: string[] = [];
    let providerGeneration = 0;
    let consumerActivations = 0;
    let stoppingConsumers = 0;
    const runtime = fixture.create([
      provider((scope) => {
        const generation = ++providerGeneration;
        let live = true;
        scope.acquire(() => {
          assert.equal(stoppingConsumers, 0);
          live = false;
          log.push(`provider ${generation} released`);
        });
        scope.provide("lifecycleBacking", {
          generation,
          read: () => {
            assert.equal(live, true, "consumer used withdrawn backing");
            return generation;
          },
        });
      }),
      consumer((scope) => {
        assert.equal(stoppingConsumers, 0, "consumer generations overlapped");
        consumerActivations++;
        const service = scope.get("lifecycleBacking");
        log.push(`consumer ${service.read()} started`);
        scope.acquire(async () => {
          stoppingConsumers++;
          entered.open();
          await finish.opened;
          log.push(`consumer ${service.read()} stopped`);
          stoppingConsumers--;
        });
      }),
    ]);
    await runtime.enable("provider");
    await runtime.enable("consumer");
    const restarting = fixture.watch(runtime.restart("provider"));
    await entered.opened;
    await checkpoint();
    assert.equal(restarting.settled, false);
    assert.equal(consumerActivations, 1);
    assert.deepEqual(log, ["consumer 1 started"]);
    finish.open();
    await restarting.done;
    // PDF explicitly enables dependents; Markdown already re-gates them.
    await runtime.enable("consumer");
    assert.deepEqual(log, [
      "consumer 1 started",
      "consumer 1 stopped",
      "provider 1 released",
      "consumer 2 started",
    ]);
  },
};

const alreadyStopping: LifecycleScenario = {
  id: "already-stopping-dependent",
  expectation:
    "an already-stopping dependent finishes before its provider releases backing",
  async run(fixture) {
    const entered = fixture.gate();
    const finish = fixture.gate();
    const log: string[] = [];
    let live = true;
    const runtime = fixture.create([
      provider((scope) => {
        scope.acquire(() => {
          live = false;
          log.push("provider");
        });
        scope.provide("lifecycleBacking", {
          generation: 1,
          read: () => {
            assert.equal(live, true);
            return 1;
          },
        });
      }),
      consumer((scope) => {
        const service = scope.get("lifecycleBacking");
        scope.acquire(async () => {
          entered.open();
          await finish.opened;
          assert.equal(service.read(), 1);
          log.push("consumer");
        });
      }),
    ]);
    await runtime.enable("provider");
    await runtime.enable("consumer");
    const dependent = fixture.watch(runtime.disable("consumer"));
    await entered.opened;
    const providerStop = fixture.watch(runtime.disable("provider"));
    const rootStop = fixture.watch(runtime.dispose());
    await checkpoint();
    assert.deepEqual(log, []);
    assert.deepEqual(
      [dependent.settled, providerStop.settled, rootStop.settled],
      [false, false, false],
    );
    finish.open();
    await Promise.all([dependent.done, providerStop.done, rootStop.done]);
    assert.deepEqual(log, ["consumer", "provider"]);
  },
};

function cancellation(stop: "disable" | "dispose"): LifecycleScenario {
  return {
    id: `cancel-${stop}`,
    expectation: `${stop} cancels gated activation, drains acquired resources, and refuses late acquire`,
    async run(fixture) {
      const activated = fixture.gate();
      const activationFinish = fixture.gate();
      const releaseEntered = fixture.gate();
      const releaseFinish = fixture.gate();
      const lateEntered = fixture.gate();
      const lateFinish = fixture.gate();
      const log: string[] = [];
      let refused = false;
      const runtime = fixture.create([
        provider(async (scope) => {
          scope.acquire(async () => {
            releaseEntered.open();
            await releaseFinish.opened;
            log.push("acquired released");
          });
          scope.provide("lifecycleBacking", backing());
          activated.open();
          await activationFinish.opened;
          try {
            scope.acquire(async () => {
              lateEntered.open();
              await lateFinish.opened;
              log.push("late released");
            });
          } catch {
            refused = true;
          }
        }),
      ]);
      const enabling = fixture.watch(runtime.enable("provider"));
      await activated.opened;
      assert.equal(runtime.service("lifecycleBacking"), undefined);
      const stopping = fixture.watch(
        stop === "dispose" ? runtime.dispose() : runtime.disable("provider"),
      );
      await releaseEntered.opened;
      await checkpoint();
      assert.equal(stopping.settled, false);
      releaseFinish.open();
      await stopping.done;
      assert.deepEqual(log, ["acquired released"]);
      assert.equal(
        enabling.settled,
        false,
        "cancellation must not wait for uncooperative activation",
      );
      assert.equal(runtime.state("provider"), "inactive");
      activationFinish.open();
      await lateEntered.opened;
      assert.equal(
        refused,
        true,
        "late resource is released immediately and acquire throws",
      );
      lateFinish.open();
      await enabling.done;
      await checkpoint();
      assert.deepEqual(log, ["acquired released", "late released"]);
      assert.equal(runtime.service("lifecycleBacking"), undefined);
      assert.equal(runtime.state("provider"), "inactive");
    },
  };
}

function lateDrain(
  stop: "disable" | "dispose",
  fails: boolean,
): LifecycleScenario {
  return {
    id: `late-drain-${stop}-${fails ? "error" : "success"}`,
    expectation: `${stop} joins two waves of late inverses until the final inverse ${fails ? "rejects" : "succeeds"}`,
    async run(fixture) {
      if (fails) {
        fixture.expectErrors("late drain B failed");
      }
      const activated = fixture.gate();
      const activationFinish = fixture.gate();
      const ordinaryEntered = fixture.gate();
      const ordinaryFinish = fixture.gate();
      const ordinaryCompleted = fixture.gate();
      const lateAEntered = fixture.gate();
      const lateAFinish = fixture.gate();
      const lateBEntered = fixture.gate();
      const lateBFinish = fixture.gate();
      const log: string[] = [];
      const releasing = new Set<string>();
      let scope: ActivationScope | undefined;
      const runtime = fixture.create([
        provider(async (active) => {
          scope = active;
          active.acquire(async () => {
            ordinaryEntered.open();
            await ordinaryFinish.opened;
            log.push("ordinary");
            ordinaryCompleted.open();
          });
          active.provide("lifecycleBacking", backing());
          activated.open();
          await activationFinish.opened;
        }),
      ]);
      const enabling = fixture.watch(runtime.enable("provider"));
      await activated.opened;
      const stoppedScope = scope;
      assert.ok(stoppedScope);
      assert.equal(runtime.service("lifecycleBacking"), undefined);
      const stopProvider = () =>
        stop === "dispose" ? runtime.dispose() : runtime.disable("provider");
      const stops = [fixture.watch(stopProvider())];
      await ordinaryEntered.opened;
      stops.push(fixture.watch(stopProvider()));
      assert.throws(() =>
        stoppedScope.acquire(async () => {
          releasing.add("A");
          lateAEntered.open();
          await lateAFinish.opened;
          releasing.delete("A");
          log.push("A");
        }),
      );
      await lateAEntered.opened;
      await checkpoint();
      assert.deepEqual(
        stops.map((operation) => operation.settled),
        [false, false],
      );
      assert.deepEqual([...log], []);
      ordinaryFinish.open();
      await ordinaryCompleted.opened;
      // Let release resume past the ordinary inverse and wait on A before B
      // arrives. A single-snapshot drain cannot join that second wave.
      await checkpoint();
      assert.deepEqual(log, ["ordinary"]);
      assert.deepEqual([...releasing], ["A"]);
      assert.deepEqual(
        stops.map((operation) => operation.settled),
        [false, false],
      );
      assert.throws(() =>
        stoppedScope.acquire(async () => {
          releasing.add("B");
          lateBEntered.open();
          await lateBFinish.opened;
          releasing.delete("B");
          log.push("B");
          if (fails) {
            throw new Error("late drain B failed");
          }
        }),
      );
      await lateBEntered.opened;
      lateAFinish.open();
      await checkpoint();
      assert.deepEqual(log, ["ordinary", "A"]);
      assert.deepEqual([...releasing], ["B"], "B is still releasing");
      assert.deepEqual(
        stops.map((operation) => operation.settled),
        [false, false],
        "every stop caller must join B before provider teardown finishes",
      );
      lateBFinish.open();
      await Promise.all(stops.map((operation) => operation.done));
      assert.deepEqual(log, ["ordinary", "A", "B"]);
      assert.equal(releasing.size, 0);
      assert.equal(runtime.state("provider"), "inactive");
      assert.equal(enabling.settled, false, "stop must not await activation");
      activationFinish.open();
      await enabling.done;
      assert.equal(runtime.state("provider"), "inactive");
      assert.equal(runtime.service("lifecycleBacking"), undefined);
    },
  };
}

function rollbackOverlap(
  stop: "disable" | "dispose",
  fails: boolean,
): LifecycleScenario {
  return {
    id: `rollback-${stop}-${fails ? "error" : "success"}`,
    expectation: `rollback and ${stop} join release even when its inverse ${fails ? "rejects" : "succeeds"}`,
    async run(fixture) {
      fixture.expectErrors("activation failed", "rollback inverse failed");
      const entered = fixture.gate();
      const finish = fixture.gate();
      const log: string[] = [];
      const runtime = fixture.create([
        provider((scope) => {
          scope.acquire(() => {
            log.push("older");
          });
          scope.acquire(async () => {
            entered.open();
            await finish.opened;
            log.push("newer");
            if (fails) {
              throw new Error("rollback inverse failed");
            }
          });
          scope.provide("lifecycleBacking", backing());
          throw new Error("activation failed");
        }),
      ]);
      const enabling = fixture.watch(runtime.enable("provider"));
      await entered.opened;
      const stopping = fixture.watch(
        stop === "dispose" ? runtime.dispose() : runtime.disable("provider"),
      );
      await checkpoint();
      assert.deepEqual([enabling.settled, stopping.settled], [false, false]);
      assert.equal(runtime.service("lifecycleBacking"), undefined);
      finish.open();
      await Promise.all([enabling.done, stopping.done]);
      assert.deepEqual(log, ["newer", "older"]);
      assert.equal(
        runtime.errors.filter((error) =>
          error.includes("rollback inverse failed"),
        ).length,
        fails ? 1 : 0,
      );
      assert.notEqual(runtime.state("provider"), "active");
    },
  };
}

const cleanupContinuation: LifecycleScenario = {
  id: "cleanup-continuation",
  expectation:
    "throwing and rejecting inverses are logged once and remaining LIFO releases continue",
  async run(fixture) {
    fixture.expectErrors(
      "synchronous inverse failed",
      "asynchronous inverse failed",
    );
    const log: string[] = [];
    const runtime = fixture.create([
      provider((scope) => {
        scope.acquire(() => {
          log.push("oldest");
        });
        scope.acquire(() => {
          log.push("throw");
          throw new Error("synchronous inverse failed");
        });
        scope.acquire(async () => {
          log.push("reject");
          throw new Error("asynchronous inverse failed");
        });
        scope.acquire(() => {
          log.push("newest");
        });
      }),
    ]);
    await runtime.enable("provider");
    await runtime.dispose();
    assert.deepEqual(log, ["newest", "reject", "throw", "oldest"]);
    assert.equal(
      runtime.errors.filter(
        (error) =>
          error.includes("synchronous inverse failed") &&
          !error.includes("asynchronous"),
      ).length,
      1,
    );
    assert.equal(
      runtime.errors.filter((error) =>
        error.includes("asynchronous inverse failed"),
      ).length,
      1,
    );
  },
};

const ordering: LifecycleScenario = {
  id: "dependency-and-lifo-order",
  expectation:
    "transitive dependents stop before providers and each plugin releases LIFO",
  async run(fixture) {
    const log: string[] = [];
    function resources(scope: ActivationScope, id: string): void {
      scope.acquire(() => {
        log.push(`${id} first`);
      });
      scope.acquire(() => {
        log.push(`${id} second`);
      });
    }
    const runtime = fixture.create([
      provider((scope) => {
        resources(scope, "provider");
        scope.provide("lifecycleBacking", backing());
      }),
      {
        ...consumer((scope) => {
          resources(scope, "consumer");
          scope.provide("lifecycleDerived", scope.get("lifecycleBacking"));
        }),
        provides: "lifecycleDerived",
      },
      {
        id: "leaf",
        requires: ["consumer"],
        activate: (scope) => {
          resources(scope, "leaf");
        },
      },
    ]);
    await runtime.enable("provider");
    await runtime.enable("consumer");
    await runtime.enable("leaf");
    await runtime.dispose();
    assert.deepEqual(log, [
      "leaf second",
      "leaf first",
      "consumer second",
      "consumer first",
      "provider second",
      "provider first",
    ]);
  },
};

const transitiveProviderDisable: LifecycleScenario = {
  id: "transitive-provider-disable",
  expectation:
    "disabling a provider joins its transitive leaf before releasing either service backing",
  async run(fixture) {
    const leafEntered = fixture.gate();
    const leafFinish = fixture.gate();
    const log: string[] = [];
    let isBackingLive = true;
    let isDerivedLive = true;
    let isLeafStopping = false;
    const runtime = fixture.create([
      // Declaration order deliberately differs from dependency order.
      {
        id: "leaf",
        requires: ["consumer"],
        activate(scope) {
          const derived = scope.get("lifecycleDerived");
          scope.acquire(async () => {
            isLeafStopping = true;
            leafEntered.open();
            await leafFinish.opened;
            assert.equal(derived.read(), 1);
            log.push("leaf");
            isLeafStopping = false;
          });
        },
      },
      provider((scope) => {
        scope.acquire(() => {
          assert.equal(isLeafStopping, false);
          assert.equal(isDerivedLive, false);
          isBackingLive = false;
          log.push("provider");
        });
        scope.provide("lifecycleBacking", {
          generation: 1,
          read() {
            assert.equal(
              isBackingLive,
              true,
              "provider backing released early",
            );
            return 1;
          },
        });
      }),
      {
        ...consumer((scope) => {
          const service = scope.get("lifecycleBacking");
          scope.acquire(() => {
            assert.equal(isLeafStopping, false);
            assert.equal(service.read(), 1);
            isDerivedLive = false;
            log.push("consumer");
          });
          scope.provide("lifecycleDerived", {
            generation: service.generation,
            read() {
              assert.equal(
                isDerivedLive,
                true,
                "derived backing released early",
              );
              return service.read();
            },
          });
        }),
        provides: "lifecycleDerived",
      },
    ]);
    await runtime.enable("provider");
    await runtime.enable("consumer");
    await runtime.enable("leaf");
    for (const id of ["provider", "consumer", "leaf"]) {
      assert.equal(runtime.state(id), "active");
    }
    const service = runtime.service("lifecycleBacking");
    const derived = runtime.service("lifecycleDerived");
    assert.ok(service);
    assert.ok(derived);
    const stopping = fixture.watch(runtime.disable("provider"));
    await checkpoint();
    // Check initiation before awaiting the gate so missing recursive traversal
    // fails here, before fixture disposal could start the omitted leaf cleanup.
    assert.equal(
      isLeafStopping,
      true,
      "provider disable must start leaf cleanup",
    );
    await leafEntered.opened;
    assert.equal(stopping.settled, false);
    assert.deepEqual(log, []);
    // Capture service identities before withdrawal: publication visibility
    // differs by runtime, but both backing resources must still be usable.
    assert.equal(service.read(), 1);
    assert.equal(derived.read(), 1);
    leafFinish.open();
    await stopping.done;
    assert.deepEqual(log, ["leaf", "consumer", "provider"]);
    for (const id of ["provider", "consumer", "leaf"]) {
      assert.equal(runtime.state(id), "inactive");
    }
    assert.equal(runtime.service("lifecycleBacking"), undefined);
    assert.equal(runtime.service("lifecycleDerived"), undefined);
  },
};

const earlyRelease: LifecycleScenario = {
  id: "early-release-parent-dispose",
  expectation:
    "repeated early release and parent disposal all wait for the in-flight inverse",
  needsEarlyRelease: true,
  async run(fixture) {
    const entered = fixture.gate();
    const finish = fixture.gate();
    let release: (() => void | Promise<void>) | undefined;
    let released = 0;
    const runtime = fixture.create([
      provider((scope) => {
        release = scope.acquire(async () => {
          entered.open();
          await finish.opened;
          released++;
        });
      }),
    ]);
    await runtime.enable("provider");
    assert.ok(release, "adapter advertised early release");
    const first = fixture.watch(Promise.resolve(release()));
    await entered.opened;
    const repeated = fixture.watch(Promise.resolve(release()));
    const disposing = fixture.watch(runtime.dispose());
    await checkpoint();
    assert.deepEqual(
      [first.settled, repeated.settled, disposing.settled],
      [false, false, false],
    );
    finish.open();
    await Promise.all([first.done, repeated.done, disposing.done]);
    assert.equal(released, 1);
  },
};

const staleActivation: LifecycleScenario = {
  id: "stale-activation-after-cancel",
  expectation:
    "a cancelled activation cannot overwrite a fresh generation or leave itself active",
  async run(fixture) {
    const firstEntered = fixture.gate();
    const firstFinish = fixture.gate();
    const freshEntered = fixture.gate();
    const released: number[] = [];
    let generation = 0;
    const runtime = fixture.create([
      provider(async (scope) => {
        const current = ++generation;
        scope.acquire(() => {
          released.push(current);
        });
        scope.provide("lifecycleBacking", backing(current));
        if (current === 1) {
          firstEntered.open();
          await firstFinish.opened;
        } else {
          freshEntered.open();
        }
      }),
    ]);
    const old = fixture.watch(runtime.enable("provider"));
    await firstEntered.opened;
    await runtime.disable("provider");
    assert.deepEqual(released, [1]);
    const fresh = fixture.watch(runtime.enable("provider"));
    await freshEntered.opened;
    await checkpoint();
    assert.equal(runtime.service("lifecycleBacking")?.generation, 2);
    firstFinish.open();
    await Promise.all([old.done, fresh.done]);
    assert.equal(runtime.state("provider"), "active");
    assert.equal(runtime.service("lifecycleBacking")?.generation, 2);
    assert.deepEqual(released, [1]);
  },
};

const replacedProvider: LifecycleScenario = {
  id: "provider-replaced-during-activation",
  expectation:
    "a consumer starting against a withdrawn provider cannot commit against its replacement",
  async run(fixture) {
    const entered = fixture.gate();
    const finish = fixture.gate();
    const released: number[] = [];
    let generation = 0;
    let consumerStarts = 0;
    const runtime = fixture.create([
      provider((scope) => {
        scope.provide("lifecycleBacking", backing(++generation));
      }),
      {
        ...consumer(async (scope) => {
          const service = scope.get("lifecycleBacking");
          scope.acquire(() => {
            released.push(service.generation);
          });
          scope.provide("lifecycleDerived", service);
          if (++consumerStarts === 1) {
            entered.open();
            await finish.opened;
          }
        }),
        provides: "lifecycleDerived",
      },
    ]);
    await runtime.enable("provider");
    const starting = fixture.watch(runtime.enable("consumer"));
    await entered.opened;
    await runtime.disable("provider");
    assert.deepEqual(released, [1]);
    const replacing = fixture.watch(runtime.enable("provider"));
    await checkpoint();
    finish.open();
    await Promise.all([starting.done, replacing.done]);
    const derived = runtime.service("lifecycleDerived");
    assert.notEqual(derived?.generation, 1);
    await runtime.enable("consumer");
    assert.equal(runtime.service("lifecycleDerived")?.generation, 2);
  },
};

const permanentShutdown: LifecycleScenario = {
  id: "permanent-shutdown",
  expectation:
    "application shutdown cannot reactivate plugins or republish services",
  async run(fixture) {
    let activations = 0;
    const runtime = fixture.create([
      provider((scope) => {
        activations++;
        scope.provide("lifecycleBacking", backing());
      }),
    ]);
    await runtime.enable("provider");
    await runtime.dispose();
    // A closed native runtime may reject the request or return inactive.
    try {
      await runtime.enable("provider");
    } catch {
      assert.equal(runtime.state("provider"), "inactive");
    }
    assert.equal(activations, 1);
    assert.equal(runtime.state("provider"), "inactive");
    assert.equal(runtime.service("lifecycleBacking"), undefined);
  },
};

const lateRejection: LifecycleScenario = {
  id: "no-unhandled-rejections",
  expectation:
    "a rejecting late resource inverse is handled after the owner has stopped",
  async run(fixture) {
    fixture.expectErrors("late inverse failed");
    let scope: ActivationScope | undefined;
    const runtime = fixture.create([
      provider((active) => {
        scope = active;
      }),
    ]);
    await runtime.enable("provider");
    await runtime.dispose();
    const stoppedScope = scope;
    assert.ok(stoppedScope);
    let calls = 0;
    assert.throws(() =>
      stoppedScope.acquire(() => {
        calls++;
        return Promise.reject(new Error("late inverse failed"));
      }),
    );
    await checkpoint();
    assert.equal(calls, 1);
    // The suite runner listens for unhandledRejection around every scenario,
    // including the event-loop checkpoint after fixture teardown.
  },
};

export const lifecycleScenarios: readonly LifecycleScenario[] = [
  concurrentEnable,
  concurrentStop("disable"),
  concurrentStop("dispose"),
  providerRestart,
  alreadyStopping,
  cancellation("disable"),
  cancellation("dispose"),
  lateDrain("disable", false),
  lateDrain("disable", true),
  lateDrain("dispose", false),
  lateDrain("dispose", true),
  rollbackOverlap("disable", false),
  rollbackOverlap("disable", true),
  rollbackOverlap("dispose", false),
  rollbackOverlap("dispose", true),
  cleanupContinuation,
  ordering,
  transitiveProviderDisable,
  earlyRelease,
  staleActivation,
  replacedProvider,
  permanentShutdown,
  lateRejection,
];
