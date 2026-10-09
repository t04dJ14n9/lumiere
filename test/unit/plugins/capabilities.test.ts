import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { features, workbenchFeatures } from "../../../src/plugins/catalog";
import { CORE_ORDER } from "../../../src/plugins/plugin-order";
import type { Capability, Manifest } from "../../../src/shared/manifest";

const manifests = async (): Promise<Manifest[]> => {
  const core = await Promise.all(
    [...CORE_ORDER, "publicApi"].map(
      async (id) =>
        (
          (await import(`../../../src/plugins/${id}/manifest`)) as {
            default: Manifest;
          }
        ).default,
    ),
  );
  return [...core, ...features, ...workbenchFeatures];
};

const contributed: [Capability, keyof NonNullable<Manifest["contributes"]>][] =
  [
    ["commands", "commands"],
    ["keybindings", "keybindings"],
    ["views", "views"],
  ];

test("a plugin declares commands, keybindings and views exactly when it contributes them", async () => {
  for (const manifest of await manifests()) {
    assert.ok(manifest.capabilities.length > 0, manifest.id);
    assert.equal(
      new Set(manifest.capabilities).size,
      manifest.capabilities.length,
      `${manifest.id} lists a capability twice`,
    );
    for (const [capability, field] of contributed) {
      const contributes = (manifest.contributes?.[field]?.length ?? 0) > 0;
      assert.equal(
        manifest.capabilities.includes(capability),
        contributes,
        `${manifest.id}: ${capability}`,
      );
    }
  }
});

test("only the editor core registers the editor, and network plugins check workspace trust", async () => {
  const all = await manifests();
  assert.deepEqual(
    all
      .filter((manifest) => manifest.capabilities.includes("editorProvider"))
      .map((manifest) => manifest.id),
    ["editor"],
  );
  for (const manifest of all) {
    if (!manifest.capabilities.includes("network")) {
      continue;
    }
    const dir = join("src/plugins", manifest.id);
    const source = readdirSync(dir)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");
    assert.match(source, /isTrusted/, `${manifest.id} must check trust`);
  }
});
