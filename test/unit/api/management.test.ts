import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./fixture";
import { pluginStatusItems } from "../../../src/host/api/management";
import type {
  PluginDescriptor,
  PluginState,
} from "../../../src/host/api/types";
import type { HostViews, PickItem } from "../../../src/shared/runtime";
import { contributions } from "../../../scripts/generate-contributions";
import { contributionId } from "../../../src/shared/setting-schema";

const descriptor = (
  id: string,
  kind: PluginDescriptor["kind"],
): PluginDescriptor => ({
  id,
  title: id.toUpperCase(),
  description: `${id} plugin`,
  kind,
  defaultEnabled: true,
  surfaces: ["host"],
});
const state = (
  id: string,
  value: PluginState["state"],
  extra: Partial<PluginState> = {},
): PluginState => ({
  id,
  enabled: value !== "disabled",
  state: value,
  waitingFor: [],
  ...extra,
});

test("plugin status lists problems first, says what a plugin waits for, and links its switch", () => {
  const items = pluginStatusItems(
    [
      descriptor("editor", "core"),
      descriptor("tables", "feature"),
      descriptor("vim", "feature"),
      descriptor("acme.badges", "external"),
      descriptor("backlinks", "feature"),
    ],
    [
      state("editor", "active"),
      state("tables", "pending", { waitingFor: ["livePreview", "render"] }),
      state("vim", "disabled"),
      state("acme.badges", "failed", { error: "Error: boom" }),
      state("backlinks", "active"),
      state("unknown", "active"),
    ],
  );
  assert.deepEqual(
    items.map((item) => [item.label, item.description, item.detail]),
    [
      ["$(error) ACME.BADGES", "Failed · external", "Error: boom"],
      [
        "$(clock) TABLES",
        "Waiting for livePreview, render · feature",
        "tables plugin",
      ],
      ["$(pass) EDITOR", "Active · core", "editor plugin"],
      ["$(pass) BACKLINKS", "Active · feature", "backlinks plugin"],
      ["$(circle-slash) VIM", "Disabled · feature", "vim plugin"],
    ],
  );
  assert.deepEqual(
    items.map((item) => item.value),
    [
      { id: "acme.badges", setting: "markdownWorkshop.plugins.external" },
      { id: "tables", setting: "markdownWorkshop.plugins.tables.enabled" },
      { id: "editor" },
      {
        id: "backlinks",
        setting: "markdownWorkshop.plugins.backlinks.enabled",
      },
      { id: "vim", setting: "markdownWorkshop.plugins.vim.enabled" },
    ],
  );
});

test("Manage Plugins opens plugin settings for the active note", async () => {
  const f = await fixture();
  await f.commands.get(contributionId("managePlugins"))?.();
  assert.deepEqual(
    f.settings.map((resource) => String(resource)),
    [f.panel.document.uri],
  );
  await f.dispose();
});

test("Show Plugin Status picks from the active editor's states and opens the chosen switch", async () => {
  const f = await fixture();
  const messages: string[] = [];
  f.workshop.inform = (message) => messages.push(message);
  delete f.workshop.views;
  // Without native views (a minimal host) the command explains itself.
  await f.commands.get(contributionId("showPluginStatus"))?.();
  assert.equal(messages.length, 1);

  let offered: readonly PickItem<unknown>[] = [];
  let placeholder = "";
  f.workshop.views = {
    pick: async (options: Parameters<HostViews["pick"]>[0]) => {
      placeholder = options.placeholder;
      offered = options.items("");
      assert.ok(
        options
          .items("disabled")
          .every((item) => item.description?.startsWith("Disabled")),
      );
      const item = offered.find((candidate) =>
        candidate.label.endsWith(" Tags"),
      );
      return { item, query: "" } as never;
    },
  } as unknown as HostViews;
  const opened: unknown[][] = [];
  f.platform.settings = async (...args) => {
    opened.push(args);
  };
  await f.commands.get(contributionId("showPluginStatus"))?.();
  assert.match(placeholder, /Note\.md/);
  const titles = (ids: readonly string[]) =>
    ids
      .map(
        (id) =>
          f.api.getPluginCatalog().find((entry) => entry.id === id)!.title,
      )
      .sort();
  assert.deepEqual(
    offered.map((item) => item.label.replace(/^\$\([^)]+\) /, "")).sort(),
    titles(f.api.getPlugins("panel").map((plugin) => plugin.id)),
  );
  assert.deepEqual(
    opened.map(([resource, setting]) => [String(resource), setting]),
    [[f.panel.document.uri, "markdownWorkshop.plugins.tags.enabled"]],
  );
  await f.dispose();
});

test("management and association commands work in every preset", async () => {
  const generated = await contributions();
  for (const id of [
    "managePlugins",
    "showPluginStatus",
    "useForMarkdownInWorkspace",
  ]) {
    const command = contributionId(id);
    assert.ok(generated.commands.some((item) => item.command === command));
    const menu = generated.menus.commandPalette.find(
      (item) => item.command === command,
    );
    assert.ok(menu, command);
    assert.equal("when" in menu, false, command);
  }
});
