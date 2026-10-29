import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { APP_DEFAULTS, withAppDefaults } from "../../src/server/defaults";

const ROOT = path.resolve(import.meta.dirname, "../../../..");

test("Git's features start off in the app, and other defaults stay VS Code's", () => {
  const contributed = [
    {
      key: "lumiere.markdown.plugins.gitBlame.enabled",
      schema: { type: "boolean", default: true, description: "Blame" },
    },
    {
      key: "lumiere.markdown.editor.fontSize",
      schema: { type: "number", default: 16 },
    },
  ];
  const changed = withAppDefaults(contributed);
  assert.deepEqual(changed[0], {
    key: "lumiere.markdown.plugins.gitBlame.enabled",
    schema: { type: "boolean", default: false, description: "Blame" },
  });
  assert.equal(changed[1], contributed[1]);
  assert.equal(
    contributed[0]!.schema.default,
    true,
    "the input is not changed",
  );
});

test("every key the app changes is one of Lumière's settings", () => {
  const configuration = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf8"),
  ).contributes.configuration as { properties?: Record<string, unknown> }[];
  const keys = new Set(
    configuration.flatMap((section) => Object.keys(section.properties ?? {})),
  );
  for (const key of Object.keys(APP_DEFAULTS)) {
    assert.ok(keys.has(key), key);
  }
});
