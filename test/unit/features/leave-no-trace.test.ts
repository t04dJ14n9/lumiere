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

// Core hosts started once per window by bootstrap, with their own tests:
// the editor host owns VS Code's editor registration, the vault and
// document hosts own the vault and documents for every panel.
const covered = new Set([
  "editor",
  "vault",
  "document",
  "publicApi",
  "dialect",
]);

const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

/** Answers the fakes cannot give: "no active note" instead of a fake one. */
const overrides: Record<string, Record<string, unknown>> = {
  backlinks: { "workbench.views.activeNote": () => undefined },
  outline: { "editors.active": () => undefined },
};

const configs: Record<string, unknown> = {
  commands: { features },
};

const definitions = Object.values(hostPlugins).filter(
  (plugin) => !covered.has(plugin.name),
) as Plugin<unknown>[];

for (const definition of definitions) {
  test(`${definition.name} (host): stopping it leaves no trace`, async () => {
    const root = Context.create({ rank: pluginRank });
    const trackers: [string, ReturnType<typeof trackingFake>["tracker"]][] = [];
    const services = [
      ...(definition.inject?.required ?? []),
      ...(definition.inject?.optional ?? []),
    ] as (keyof Services)[];
    for (const service of services) {
      const { fake, tracker } = trackingFake<never>(
        service,
        overrides[definition.name],
      );
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
  const { fake, tracker } = trackingFake<never>("workbench");
  root.provide("workbench", fake);
  const leaky = root.plugin({
    name: "leaky",
    inject: { required: ["workbench"] },
    apply(ctx) {
      ctx.workbench.command("leaky.command", () => {});
      ctx.effect(() => ctx.workbench.command("tidy.command", () => {}));
    },
  });
  await root.settled();
  await leaky.dispose();
  assert.deepEqual(tracker.outstanding(), ["workbench.command"]);
  await root.dispose();
});
