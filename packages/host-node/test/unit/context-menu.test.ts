import test from "node:test";
import assert from "node:assert/strict";
import type { UiEvent, UiRequest } from "../../src/protocol";
import {
  ContextKeys,
  menuGroups,
  registerContextMenus,
  type MenuContribution,
} from "../../src/host/context-menu";
import { createHostCommands } from "../../src/host/services";
import type { LivePanel } from "../../src/host/panel";
import type { PanelHub } from "../../src/host/panels";
import { parsePageFrame } from "../../src/protocol";

const EDITOR = "lumiere.markdown.editor";
const contributions: MenuContribution[] = [
  {
    command: "lumiere.markdown.toggleBold",
    title: "Toggle Bold",
    group: "formatting@1",
    when: "activeCustomEditorId == 'lumiere.markdown.editor' && lumiere.markdown.plugin.formatting && webviewSection == 'markdownContent'",
  },
  {
    command: "lumiere.markdown.selectionActions",
    title: "Selection Actions",
    group: "0_agent@2",
    when: "webviewSection == 'markdownContent' && lumiere.markdown.hasSelection",
  },
  {
    command: "lumiere.markdown.copyLinkForAgent",
    title: "Copy Link for Agent",
    group: "0_agent@1",
    when: "activeCustomEditorId == 'lumiere.markdown.editor' && lumiere.markdown.plugin.agentBridge && webviewSection == 'markdownContent' && lumiere.markdown.hasSelection",
  },
  {
    command: "lumiere.pdf.fitWidth",
    title: "Fit Width",
    group: "1_pdfView@2",
    when: "activeCustomEditorId == 'lumiere.pdf.viewer'",
  },
];

test("items show when their clause holds, grouped and ordered as VS Code orders them", () => {
  const keys: Record<string, unknown> = {
    activeCustomEditorId: EDITOR,
    webviewSection: "markdownContent",
    "lumiere.markdown.hasSelection": true,
    "lumiere.markdown.plugin.agentBridge": true,
    "lumiere.markdown.plugin.formatting": true,
  };
  const groups = menuGroups(contributions, (key) => keys[key]);
  assert.deepEqual(
    groups.map((group) => group.map((item) => item.title)),
    [["Copy Link for Agent", "Selection Actions"], ["Toggle Bold"]],
  );
  keys["lumiere.markdown.hasSelection"] = false;
  assert.deepEqual(
    menuGroups(contributions, (key) => keys[key]).map((group) =>
      group.map((item) => item.title),
    ),
    [["Toggle Bold"]],
  );
});

/** A page that answers the menu with `answer` and records what it was asked. */
function fakePanel(answer: number | null) {
  const listeners = new Set<(event: UiEvent) => void>();
  const asked: UiRequest[] = [];
  const panel = {
    onUi: (listener: (event: UiEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ask: async (request: UiRequest) => {
      asked.push(request);
      return answer;
    },
    shell: { onDispose: () => () => {} },
  } as unknown as LivePanel;
  const rightClick = (context: Record<string, string | boolean>) => {
    for (const listener of listeners) {
      listener({ type: "contextmenu", x: 10, y: 20, context });
    }
  };
  return { panel, asked, rightClick };
}

function setUp(answer: number | null) {
  const keys = new ContextKeys();
  const ran: unknown[][] = [];
  const commands = createHostCommands(() => {}, keys);
  for (const item of contributions) {
    commands.register(item.command, (...args) => {
      ran.push([item.command, ...args]);
    });
  }
  const page = fakePanel(answer);
  let opened: ((panel: LivePanel) => void) | undefined;
  const panels = {
    onOpened: (listener: (panel: LivePanel) => void) => {
      opened = listener;
      return () => {};
    },
  } as unknown as PanelHub;
  const stop = registerContextMenus({
    panels,
    contributions,
    keys,
    commands,
    viewType: EDITOR,
    log: () => {},
  });
  opened?.(page.panel);
  return { commands, ran, page, stop };
}

test("a right-click draws the items the plugins' keys allow, and runs the chosen one", async () => {
  const { commands, ran, page } = setUp(0);
  // The plugins set these through VS Code's setContext command.
  await commands.execute(
    "setContext",
    "lumiere.markdown.plugin.agentBridge",
    true,
  );
  await commands.execute(
    "setContext",
    "lumiere.markdown.plugin.formatting",
    true,
  );
  page.rightClick({
    webviewSection: "markdownContent",
    "lumiere.markdown.hasSelection": true,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(page.asked[0], {
    type: "menu",
    id: (page.asked[0] as { id: number }).id,
    x: 10,
    y: 20,
    groups: [
      [{ label: "Copy Link for Agent" }, { label: "Selection Actions" }],
      [{ label: "Toggle Bold" }],
    ],
  });
  assert.deepEqual(ran, [
    [
      "lumiere.markdown.copyLinkForAgent",
      {
        webview: EDITOR,
        webviewSection: "markdownContent",
        "lumiere.markdown.hasSelection": true,
      },
    ],
  ]);
});

test("a dismissed menu, or a row that was not offered, runs nothing", async () => {
  for (const answer of [null, 7]) {
    const { ran, page } = setUp(answer);
    page.rightClick({ webviewSection: "markdownContent" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.asked.length, 1);
    assert.deepEqual(ran, []);
  }
});

test("a right-click from the page is checked before the host reads it", () => {
  const frame = (data: unknown) =>
    parsePageFrame(JSON.stringify({ ch: "ui", data }));
  assert.deepEqual(
    frame({
      type: "contextmenu",
      x: 1,
      y: 2,
      context: { a: "b", n: 3, big: "x".repeat(600), o: {} },
    }),
    {
      ch: "ui",
      data: { type: "contextmenu", x: 1, y: 2, context: { a: "b", n: 3 } },
    },
  );
  assert.equal(
    frame({ type: "contextmenu", x: "1", y: 2, context: {} }),
    undefined,
  );
  assert.equal(
    frame({ type: "contextmenu", x: 1, y: 2, context: [] }),
    undefined,
  );
  const many = Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [`k${index}`, true]),
  );
  assert.equal(
    frame({ type: "contextmenu", x: 1, y: 2, context: many }),
    undefined,
  );
});
