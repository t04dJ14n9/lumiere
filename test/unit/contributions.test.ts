import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contributions } from "../../scripts/generate-contributions";
import {
  FOLLOW_CURSOR_CONTEXT,
  VIEW_ID,
} from "../../src/plugins/outline/commands";
test("package contributions match the generator", async () => {
  assert.deepEqual(
    JSON.parse(readFileSync("package.json", "utf8")).contributes,
    await contributions(),
  );
});

test("Note Outline title actions expose one checked or unchecked Follow Cursor item", async () => {
  const generated = await contributions();
  const properties: Record<string, unknown> =
    generated.configuration.properties;
  const actions = generated.menus["view/title"];
  const expand = actions.find(
    (action) => action.command === `${VIEW_ID}.expandAll`,
  )!;
  assert.equal(expand.group, "navigation@1");
  assert.ok(expand.when.includes(`view == ${VIEW_ID}`));
  assert.ok(!expand.when.includes("activeCustomEditorId"));
  const checked = actions.find(
    (action) => action.command === `${VIEW_ID}.disableFollowCursor`,
  )!;
  const unchecked = actions.find(
    (action) => action.command === `${VIEW_ID}.enableFollowCursor`,
  )!;
  assert.equal(checked.group, "outline@1");
  assert.equal(unchecked.group, "outline@1");
  assert.ok(checked.when.endsWith(`&& ${FOLLOW_CURSOR_CONTEXT}`));
  assert.ok(unchecked.when.endsWith(`&& !${FOLLOW_CURSOR_CONTEXT}`));
  assert.equal(
    generated.commands.find((command) => command.command === checked.command)
      ?.title,
    "✓ Follow Cursor",
  );
  assert.deepEqual(properties["markdownWorkbench.outline.followCursor"], {
    type: "boolean",
    default: true,
    scope: "resource",
    description:
      "Select and reveal the current heading in Note Outline as the cursor moves, without taking focus.",
  });
});
test("the source ledger preserves the complete pinned inventory", () => {
  const ledger = readFileSync("docs/TEST_LEDGER.md", "utf8");
  for (const [tier, count] of [
    ["unit", 106],
    ["browser", 293],
    ["native", 47],
  ] as const) {
    assert.equal(
      ledger.split("\n").filter((line) => line.startsWith(`| \`${tier}/`))
        .length,
      count,
    );
  }
});
test("manifest surfaces match the host and webview registries", async () => {
  const { readdirSync, existsSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const host = readFileSync("src/plugins/host.ts", "utf8");
  const webview = readFileSync("src/plugins/webview.ts", "utf8");
  for (const directory of readdirSync("src/plugins", {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory())) {
    const file = resolve("src/plugins", directory.name, "manifest.ts");
    if (!existsSync(file)) {
      continue;
    }
    const manifest = (await import(pathToFileURL(file).href)).default as {
      id: string;
      surfaces: string[];
    };
    for (const [surface, registry] of [
      ["host", host],
      ["webview", webview],
    ]) {
      assert.equal(
        registry!.includes(`./${manifest.id}/${surface}`),
        manifest.surfaces.includes(surface!),
        `${manifest.id}/${surface}`,
      );
    }
  }
});

test("macOS Vim consumes Control keys while preserving Command editor shortcuts", async () => {
  const { keybindings } = await contributions();
  const vim = keybindings.filter(
    (binding) => binding.command === "markdownWorkbench.consumeVimHostShortcut",
  );
  assert.ok(vim.some((binding) => binding.mac === "ctrl+o"));
  assert.ok(vim.some((binding) => binding.mac === "ctrl+i"));
  for (const binding of vim) {
    assert.equal(binding.mac, binding.key);
    assert.match(binding.when ?? "", /markdownWorkbench\.plugin\.vim/);
    assert.match(
      binding.when ?? "",
      /activeCustomEditorId == 'markdownWorkbench\.editor'/,
    );
    assert.ok(!binding.mac?.includes("cmd"));
  }
  assert.ok(
    keybindings.some(
      (binding) =>
        binding.command === "markdownWorkbench.toggleItalics" &&
        binding.mac === "cmd+i",
    ),
  );
});
