import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import type { Plugin, Services } from "../../../src/kernel";
import * as hostPlugins from "../../../src/plugins/host";
import {
  features,
  pluginRank,
  workbenchFeatures,
} from "../../../src/plugins/catalog";
import { trackingFake } from "../../support/tracking-fake";

// Every host plugin is covered, core hosts (editor, vault, document,
// publicApi, dialect) included.
const covered = new Set<string>();

const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

/** Answers the fakes cannot give: "no active note" instead of a fake one. */
const overrides: Record<string, Record<string, unknown>> = {
  backlinks: { "workshop.views.activeNote": () => undefined },
  outline: { "editors.active": () => undefined },
};

/** Context keys the plugin set through `workshop.execute("setContext", …)`. */
const contextKeys = new Map<string, unknown>();
const recordContextKeys = {
  "workshop.execute": (command: string, key: string, value: unknown) => {
    if (command === "setContext") {
      contextKeys.set(key, value);
    }
    return Promise.resolve();
  },
};

const configs: Record<string, unknown> = {
  commands: { features },
  publicApi: { create() {} },
};

const definitions = Object.values(hostPlugins).filter(
  (plugin) => !covered.has(plugin.name),
) as Plugin<unknown>[];

for (const definition of definitions) {
  test(`${definition.name} (host): stopping it leaves no trace`, async () => {
    const errors: string[] = [];
    const root = Context.create({
      rank: pluginRank,
      logger: {
        debug() {},
        warn() {},
        error: (message: string, error?: unknown) =>
          void errors.push(`${message}: ${String(error)}`),
      },
    });
    contextKeys.clear();
    const trackers: [string, ReturnType<typeof trackingFake>["tracker"]][] = [];
    const services = [
      ...(definition.inject?.required ?? []),
      ...(definition.inject?.optional ?? []),
    ] as (keyof Services)[];
    for (const service of services) {
      const { fake, tracker } = trackingFake<never>(service, {
        ...recordContextKeys,
        ...overrides[definition.name],
      });
      trackers.push([service, tracker]);
      root.provide(service, fake);
    }
    const { fake: panel } = trackingFake<never>("panel");
    const config = configs[definition.name] ?? { panel };
    const baseline = root.runtime.ledger.snapshot();
    const fiber = root.plugin(definition, config);
    await root.settled();
    await idle();
    assert.equal(fiber.state, "active", String(fiber.error));
    await fiber.dispose();
    await root.settled();
    await idle();
    assert.deepEqual(root.runtime.ledger.snapshot(), baseline);
    assert.deepEqual(errors, [], "teardown logged errors");
    for (const [key, value] of contextKeys) {
      if (key.startsWith("markdownWorkbench.has")) {
        assert.equal(value, false, `${key} reset on stop`);
      }
    }
    for (const [service, tracker] of trackers) {
      assert.deepEqual(tracker.outstanding(), [], `${service} registrations`);
    }
    await root.dispose();
    assert.deepEqual(root.runtime.ledger.snapshot(), {});
  });
}

test("every host plugin of a catalog feature is covered", () => {
  const names = new Set(definitions.map((plugin) => plugin.name));
  for (const manifest of [...features, ...workbenchFeatures]) {
    if (manifest.surfaces.includes("host")) {
      assert.ok(names.has(manifest.id), manifest.id);
    }
  }
});

test("the check catches a registration made outside the plugin's context", async () => {
  const root = Context.create();
  const { fake, tracker } = trackingFake<never>("workshop");
  root.provide("workshop", fake);
  const leaky = root.plugin({
    name: "leaky",
    inject: { required: ["workshop"] },
    apply(ctx) {
      ctx.workshop.command("leaky.command", () => {});
      ctx.effect(() => ctx.workshop.command("tidy.command", () => {}));
    },
  });
  await root.settled();
  await leaky.dispose();
  assert.deepEqual(tracker.outstanding(), ["workshop.command"]);
  await root.dispose();
});
