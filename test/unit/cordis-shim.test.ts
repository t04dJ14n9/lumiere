import assert from "node:assert/strict";
import { test } from "node:test";
import { Context } from "cordis";
import { CordisApplication } from "../../src/kernel-cordis/application";
import type { CordisScope } from "../../src/kernel-cordis/application";
import { checkpoint } from "./lifecycle-conformance/shared/fixture";
import { deferredGate } from "./lifecycle-conformance/shared/harness";

test("cordis-shim uses Cordis injection and removes real child fibers without restarting the root", async () => {
  const root = new Context();
  const errors: unknown[] = [];
  let rootReleases = 0;
  const releaseRoot = root.effect(() => () => {
    rootReleases++;
  });
  const baseline = root.fiber.getEffects().length;
  const application = new CordisApplication<{ backing: number }>(
    [
      {
        id: "provider",
        provides: ["backing"],
        apply: (scope) => scope.provide("backing", 42),
      },
      {
        id: "consumer",
        requires: ["provider"],
        apply: (scope) => {
          assert.equal(scope.get("backing"), 42);
        },
      },
    ],
    (error) => errors.push(error),
    root,
  );
  try {
    await application.enable("consumer");
    assert.equal(
      application.state("consumer"),
      "blocked",
      "Cordis waits for the injected service",
    );
    assert.equal(
      root.registry.size,
      2,
      "the app and blocked consumer are registered in Cordis",
    );
    await application.enable("provider");
    // Enabling the provider wakes the retained Cordis consumer fiber.
    await application.enable("consumer");
    assert.equal(application.state("consumer"), "active");
    assert.equal(
      root.get("backing"),
      42,
      "publication is in Cordis's service table",
    );
    await application.dispose();
    assert.equal(root.get("backing"), undefined);
    assert.equal(
      root.registry.size,
      0,
      "product and application fibers are permanently removed",
    );
    assert.equal(
      root.fiber.getEffects().length,
      baseline,
      "app and logger registrations released",
    );
    assert.equal(
      rootReleases,
      0,
      "infrastructure root has never been disposed/restarted",
    );
    await assert.rejects(application.enable("provider"), /disposed/);
    await assert.rejects(application.restart("consumer"), /disposed/);
    assert.equal(root.registry.size, 0);
    assert.deepEqual(errors, []);
  } finally {
    await application.dispose();
    await releaseRoot();
  }
});

test("cordis-shim shutdown refuses an enable already waiting for provider withdrawal", async () => {
  const entered = deferredGate();
  const finish = deferredGate();
  let consumerStarts = 0;
  const application = new CordisApplication<{ backing: number }>(
    [
      {
        id: "provider",
        provides: ["backing"],
        apply(scope) {
          scope.provide("backing", 1);
          scope.acquire(async () => {
            entered.open();
            await finish.opened;
          });
        },
      },
      {
        id: "consumer",
        requires: ["provider"],
        apply() {
          consumerStarts++;
        },
      },
    ],
    (error) => assert.fail(String(error)),
  );
  try {
    await application.enable("provider");
    const stopping = application.disable("provider");
    await entered.opened;
    const enabling = application.enable("consumer");
    const refused = assert.rejects(enabling, /disposed/);
    const shutdown = application.dispose();
    finish.open();
    await Promise.all([stopping, shutdown, refused]);
    assert.equal(consumerStarts, 0);
    assert.equal(application.state("consumer"), "inactive");
  } finally {
    finish.open();
    await application.dispose();
  }
});

test("cordis-shim stop before Cordis apply starts cannot run an initializer", async () => {
  let activations = 0;
  const application = new CordisApplication<object>(
    [
      {
        id: "probe",
        apply() {
          activations++;
        },
      },
    ],
    (error) => assert.fail(String(error)),
  );
  try {
    const enabling = application.enable("probe");
    const shutdown = application.dispose();
    await Promise.all([enabling, shutdown]);
    assert.equal(activations, 0);
    assert.equal(application.state("probe"), "inactive");
  } finally {
    await application.dispose();
  }
});

test("cordis-shim original enable joins a refused inverse after cancelled apply returns", async () => {
  const entered = deferredGate();
  const finishApply = deferredGate();
  const finishLate = deferredGate();
  const errors: unknown[] = [];
  let scope: CordisScope<object> | undefined;
  const application = new CordisApplication<object>(
    [
      {
        id: "probe",
        async apply(active) {
          scope = active;
          entered.open();
          await finishApply.opened;
        },
      },
    ],
    (error) => errors.push(error),
  );
  let settled = false;
  const enabling = application.enable("probe").then(() => {
    settled = true;
  });
  try {
    await entered.opened;
    await application.disable("probe");
    const stoppedScope = scope;
    assert.ok(stoppedScope);
    assert.throws(
      () => stoppedScope.acquire(() => finishLate.opened),
      /stopped lifetime/,
    );
    finishApply.open();
    await checkpoint();
    assert.equal(
      settled,
      false,
      "cancelled application completion still represents the late inverse",
    );
    finishLate.open();
    await enabling;
    assert.deepEqual(errors, []);
  } finally {
    finishApply.open();
    finishLate.open();
    await Promise.all([enabling, application.dispose()]);
  }
});
