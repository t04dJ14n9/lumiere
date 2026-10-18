import assert from "node:assert/strict";
import test from "node:test";
import { contributions } from "../../../scripts/contributions";
import { features, workbenchFeatures } from "../../../src/plugins/catalog";
import {
  isOffSwitch,
  unmetFeatures,
  withFeaturesOff,
} from "../../../src/shared/host-capabilities";
import { WHEN_NODE_HOST } from "../../../src/shared/manifest";
import type { NoteSettings } from "../../../src/shared/host";

const ALL = [...features, ...workbenchFeatures];
const GIT_FEATURES = ["gitBlame", "gitDiffEditor", "gitGutter", "gitInline"];

test("without Git, exactly the Git features are unmet", () => {
  assert.deepEqual([...unmetFeatures(ALL, new Set())].sort(), GIT_FEATURES);
  assert.deepEqual([...unmetFeatures(ALL, new Set(["git"]))], []);
});

test("unmet features read as off, whatever their settings say", () => {
  const off = new Set(["gitGutter"]);
  const settings = withFeaturesOff(
    {
      mode: "livePreview",
      preset: "obsidian",
      features: {
        gitGutter: { enabled: true, config: { compareTo: "HEAD" } },
        tables: { enabled: true, config: {} },
      },
    } as NoteSettings,
    off,
  );
  assert.deepEqual(settings.features, {
    gitGutter: { enabled: false, config: { compareTo: "HEAD" } },
    tables: { enabled: true, config: {} },
  });
  assert.equal(isOffSwitch("plugins.gitGutter.enabled", off), true);
  assert.equal(isOffSwitch("plugins.tables.enabled", off), false);
  assert.equal(isOffSwitch("plugins.gitGutter.config", off), false);
});

test("Git commands are hidden only where the extension host is not Node", async () => {
  const generated = await contributions();
  const gitCommands = new Set(
    generated.commands
      .filter((command) => /\bGit\b/.test(command.title))
      .map((command) => command.command),
  );
  const palette = generated.menus.commandPalette.filter((entry) =>
    gitCommands.has(entry.command),
  );
  assert.ok(palette.length >= 5);
  for (const entry of palette) {
    assert.ok(entry.when?.startsWith(WHEN_NODE_HOST), entry.command);
  }
  const others = generated.menus.commandPalette.filter(
    (entry) => !gitCommands.has(entry.command),
  );
  for (const entry of others) {
    assert.ok(!entry.when?.includes("isWeb"), entry.command);
  }
});
