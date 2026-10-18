import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionManifest, pdfContributes } from "./support/manifest";

interface Contributes {
  commands: { command: string; title: string }[];
  configuration: { properties: Record<string, unknown> };
  menus: Record<string, { command: string; when?: string }[]>;
  keybindings?: {
    command: string;
    key?: string;
    mac?: string;
    when?: string;
  }[];
}

const contributes = pdfContributes<Contributes>();

test("the selection envelope command is contributed and hidden from the palette", () => {
  assert.ok(
    contributes.commands.some(
      (entry) => entry.command === "vscodeEmbedPdf.bridge.envelope",
    ),
  );
  const palette = (
    contributes.menus.commandPalette as { command: string; when?: string }[]
  ).find((entry) => entry.command === "vscodeEmbedPdf.bridge.envelope");
  assert.equal(palette?.when, "false");
  assert.equal(
    (contributes.keybindings ?? []).some(
      (entry) => entry.command === "vscodeEmbedPdf.bridge.envelope",
    ),
    false,
  );
});

test("Copy Link for Agent is the only agent command; Copy for Agent and Ask Agent are gone", () => {
  const commands = contributes.commands.map((entry) => entry.command);
  assert.ok(commands.includes("pdfWorkshop.copyLinkForAgent"));
  assert.ok(!commands.includes("pdfWorkshop.copyForAgent"));
  for (const [menu, entries] of Object.entries(contributes.menus)) {
    assert.ok(
      !entries.some((entry) => entry.command === "pdfWorkshop.copyForAgent"),
      menu,
    );
  }
  assert.ok(
    contributes.menus["webview/context"]?.some(
      (entry) => entry.command === "pdfWorkshop.copyLinkForAgent",
    ),
    "webview/context",
  );
  assert.ok(
    !(contributes.menus["editor/title"] ?? []).some(
      (entry) => entry.command === "pdfWorkshop.copyLinkForAgent",
    ),
    "editor/title must not list Copy Link for Agent",
  );
  const palette = (contributes.menus["commandPalette"] ?? []).find(
    (entry) => entry.command === "pdfWorkshop.copyLinkForAgent",
  );
  assert.ok(palette, "commandPalette still registers the command entry");
  assert.equal(
    palette?.when,
    "false",
    "commandPalette hides Copy Link for Agent",
  );
  assert.ok(
    !(contributes.keybindings ?? []).some(
      (entry) => entry.command === "pdfWorkshop.copyForAgent",
    ),
  );
  // Ask Agent was renamed Copy Link for Agent, with no leftover id, title or setting.
  assert.deepEqual(
    contributes.commands
      .filter((entry) => /agent/iu.test(entry.command))
      .map((entry) => entry.title),
    ["Copy Link for Agent"],
  );
  assert.ok(!JSON.stringify(contributes).includes("askAgent"));
  assert.ok(
    "pdfWorkshop.copyLinkForAgent.target" in
      contributes.configuration.properties,
  );
});

test("every default shortcut is scoped to the PDF viewer, to non-input focus and to the opt-out setting", () => {
  const bindings = (contributes.keybindings ?? []) as {
    key: string;
    mac?: string;
    command: string;
    when?: string;
  }[];
  assert.ok(bindings.length > 0);
  const seen = new Set<string>();
  for (const { key, mac, command, when } of bindings) {
    // Outline Ctrl+Alt+O must win over Go to Symbol even when the webview or
    // side bar has focus; it uses focusedView instead of the shared guards.
    if (
      command === "pdfWorkshop.outline.focus" ||
      command === "workbench.action.closeSidebar" ||
      command === "workbench.action.closeAuxiliaryBar" ||
      command === "workbench.action.closePanel"
    ) {
      assert.match(when ?? "", /config\.pdfWorkshop\.keyboardShortcuts/u);
      assert.ok(key === "ctrl+alt+o" || mac === "ctrl+cmd+o", command);
      for (const chord of new Set([key, mac ?? key])) {
        assert.ok(!seen.has(`${chord}|${when}`), `duplicate ${chord}`);
        seen.add(`${chord}|${when}`);
      }
      continue;
    }
    assert.ok(command.startsWith("pdfWorkshop."), command);
    for (const clause of [
      "activeCustomEditorId == 'pdfWorkshop.viewer'",
      "!inputFocus",
      "!sideBarFocus",
      "!panelFocus",
      "!auxiliaryBarFocus",
      "config.pdfWorkshop.keyboardShortcuts",
    ]) {
      assert.ok(when?.includes(clause), `${command} (${key}) lacks ${clause}`);
    }
    // No two of our own bindings share a key under the same condition.
    for (const chord of new Set([key, mac ?? key])) {
      assert.ok(!seen.has(`${chord}|${when}`), `duplicate ${chord}`);
      seen.add(`${chord}|${when}`);
    }
  }
  const setting = contributes.configuration.properties[
    "pdfWorkshop.keyboardShortcuts"
  ] as { default: boolean };
  assert.equal(setting.default, true);
});

test("Ctrl+Alt+O focuses PDF Outline with titles, and closes the chrome that hosts it when focused", () => {
  const bindings = (contributes.keybindings ?? []) as {
    key: string;
    mac?: string;
    command: string;
    when?: string;
  }[];
  const outlineKeys = bindings.filter((entry) => entry.key === "ctrl+alt+o");
  assert.deepEqual(
    outlineKeys.map((entry) => [entry.command, entry.mac, entry.when]).sort(),
    [
      [
        "pdfWorkshop.outline.focus",
        "ctrl+cmd+o",
        "activeCustomEditorId == 'pdfWorkshop.viewer' && focusedView != 'pdfWorkshop.outline' && config.pdfWorkshop.keyboardShortcuts",
      ],
      [
        "workbench.action.closeAuxiliaryBar",
        "ctrl+cmd+o",
        "focusedView == 'pdfWorkshop.outline' && auxiliaryBarFocus && config.pdfWorkshop.keyboardShortcuts",
      ],
      [
        "workbench.action.closePanel",
        "ctrl+cmd+o",
        "focusedView == 'pdfWorkshop.outline' && panelFocus && config.pdfWorkshop.keyboardShortcuts",
      ],
      [
        "workbench.action.closeSidebar",
        "ctrl+cmd+o",
        "focusedView == 'pdfWorkshop.outline' && sideBarFocus && config.pdfWorkshop.keyboardShortcuts",
      ],
    ].sort(),
  );
  // Title actions from expand/follow still hang off the outline view.
  const menus = contributes.menus["view/title"] as {
    command: string;
    when: string;
  }[];
  assert.ok(
    menus.some(
      (item) =>
        item.command === "pdfWorkshop.expandOutline" &&
        item.when === "view == pdfWorkshop.outline",
    ),
  );
  assert.ok(
    menus.some(
      (item) => item.command === "pdfWorkshop.enableOutlineFollowCursor",
    ),
  );
  assert.ok(
    menus.some(
      (item) => item.command === "pdfWorkshop.disableOutlineFollowCursor",
    ),
  );
});

test("Look Up is a setting, hidden from the palette and offered on macOS when enabled, with the clicked word resolved by its command", () => {
  const setting = contributes.configuration.properties[
    "pdfWorkshop.lookUp.enabled"
  ] as { default: boolean };
  assert.equal(setting.default, true);
  const palette = (
    contributes.menus.commandPalette as { command: string; when?: string }[]
  ).find((entry) => entry.command === "pdfWorkshop.lookUp");
  assert.equal(palette?.when, "false");
  const menu = (
    contributes.menus["webview/context"] as { command: string; when?: string }[]
  ).find((entry) => entry.command === "pdfWorkshop.lookUp");
  assert.match(menu?.when ?? "", /isMac/u);
  assert.match(menu?.when ?? "", /config\.pdfWorkshop\.lookUp\.enabled/u);
});

test("turning the page keeping the place: Option+Arrow on macOS, Ctrl+Alt+Arrow elsewhere, never plain Alt+Arrow (VS Code Go Back/Forward)", () => {
  const bindings = (contributes.keybindings ?? []) as {
    key: string;
    mac?: string;
    command: string;
  }[];
  const keep = bindings.filter((entry) => /KeepingPlace$/u.test(entry.command));
  assert.deepEqual(
    keep
      .map((entry) => [
        entry.command.replace("pdfWorkshop.", ""),
        entry.key,
        entry.mac,
      ])
      .sort(),
    [
      ["nextPageKeepingPlace", "ctrl+alt+down", "alt+down"],
      ["nextPageKeepingPlace", "ctrl+alt+right", "alt+right"],
      ["previousPageKeepingPlace", "ctrl+alt+left", "alt+left"],
      ["previousPageKeepingPlace", "ctrl+alt+up", "alt+up"],
    ],
  );
  for (const entry of bindings) {
    assert.ok(
      !/^alt\+(left|right)$/u.test(entry.key),
      `${entry.command}: ${entry.key} would take VS Code's Go Back/Forward`,
    );
  }
});

test("zen mode: Enter and Exit are chosen by inZenMode, bound to Ctrl+Alt+Z (Ctrl+Cmd+Z on macOS) and Esc Esc, only in the PDF editor and under the shortcuts setting", () => {
  const commands = contributes.commands.map((entry) => entry.command);
  assert.ok(
    commands.includes("pdfWorkshop.enterZen") &&
      commands.includes("pdfWorkshop.exitZen"),
  );
  const zen = (contributes.keybindings ?? []).filter((entry) =>
    /Zen$/u.test(entry.command),
  );
  assert.deepEqual(
    zen.map((entry) => [
      entry.command.replace("pdfWorkshop.", ""),
      entry.key,
      entry.mac,
    ]),
    [
      ["enterZen", "ctrl+alt+z", "ctrl+cmd+z"],
      ["exitZen", "ctrl+alt+z", "ctrl+cmd+z"],
      ["exitZen", "escape escape", undefined],
    ],
  );
  for (const entry of zen) {
    assert.match(
      entry.when ?? "",
      /activeCustomEditorId == 'pdfWorkshop\.viewer'/u,
    );
    assert.match(entry.when ?? "", /config\.pdfWorkshop\.keyboardShortcuts/u);
    assert.match(
      entry.when ?? "",
      entry.command.endsWith("enterZen") ? /!inZenMode/u : /(?<!!)inZenMode/u,
    );
  }
});

test("settings commands: Open Settings and the common toggles are in the palette, with a Settings… entry in the viewer menu", () => {
  const commands = contributes.commands.map((entry) => entry.command);
  for (const id of [
    "openSettings",
    "toggleSmoothScrolling",
    "toggleKeyboardShortcuts",
    "setDefaultZoom",
    "setDefaultPageLayout",
    "setDefaultScrollMode",
  ]) {
    assert.ok(commands.includes(`pdfWorkshop.${id}`), id);
    const hidden = (
      contributes.menus.commandPalette as { command: string; when?: string }[]
    ).find((entry) => entry.command === `pdfWorkshop.${id}`);
    assert.equal(
      hidden,
      undefined,
      `${id} must be available whatever the active editor is`,
    );
  }
  assert.ok(
    (contributes.menus["webview/context"] as { command: string }[]).some(
      (entry) => entry.command === "pdfWorkshop.openSettings",
    ),
  );
});

test("the viewer declares limited Restricted Mode support, so PDFs render instead of opening as raw bytes", () => {
  const manifest = extensionManifest<{
    capabilities?: {
      untrustedWorkspaces?: {
        supported?: unknown;
        restrictedConfigurations?: string[];
      };
    };
  }>();
  const untrusted = manifest.capabilities?.untrustedWorkspaces;
  assert.equal(untrusted?.supported, "limited");
  // The local MCP server must never be switched on by a workspace setting of an untrusted folder.
  assert.ok(
    untrusted?.restrictedConfigurations?.includes(
      "pdfWorkshop.agentBridge.enabled",
    ),
  );
  assert.ok(
    untrusted?.restrictedConfigurations?.includes(
      "pdfWorkshop.copyLinkForAgent.target",
    ),
  );
  for (const key of untrusted?.restrictedConfigurations ?? []) {
    assert.ok(key in contributes.configuration.properties, key);
  }
});

test("PDF location history has distinct commands and does not claim native or Vim shortcuts", () => {
  for (const name of ["historyBack", "historyForward"]) {
    const command = `pdfWorkshop.${name}`;
    assert.ok(contributes.commands.some((entry) => entry.command === command));
    assert.ok(
      contributes.menus["editor/title"]?.some(
        (entry) => entry.command === command,
      ),
    );
    assert.ok(
      !(contributes.keybindings ?? []).some(
        (entry) => entry.command === command,
      ),
    );
  }
});
