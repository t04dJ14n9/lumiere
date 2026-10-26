import test from "node:test";
import assert from "node:assert/strict";
import type { UiEvent, UiRequest } from "../../src/protocol";
import {
  ContextKeys,
  menuCommands,
  menuGroups,
  menuRows,
  parseMenus,
  registerContextMenus,
  type MenuCommand,
  type MenuContribution,
} from "../../src/host/context-menu";
import { menuEntries, type MenuEntry } from "../../src/page/menu-model";
import { createHostCommands } from "../../src/host/services";
import type { LivePanel } from "../../src/host/panel";
import type { PanelHub } from "../../src/host/panels";
import { parsePageFrame } from "../../src/protocol";

const EDITOR = "lumiere.markdown.editor";
const contributions: MenuCommand[] = [
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
    // VS Code's own key for a webview's menus (main #390); Bold keeps the older one.
    when: "webviewId == 'lumiere.markdown.editor' && lumiere.markdown.plugin.agentBridge && webviewSection == 'markdownContent' && lumiere.markdown.hasSelection",
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
    webviewId: EDITOR,
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

/** Every command of an item, through its submenus. */
function everyCommand(item: MenuContribution): MenuCommand[] {
  return "submenu" in item ? item.items.flatMap(everyCommand) : [item];
}

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

function setUp(
  answer: number | null,
  menu: readonly MenuContribution[] = contributions,
) {
  const keys = new ContextKeys();
  const ran: unknown[][] = [];
  const commands = createHostCommands(() => {}, keys);
  for (const item of menuCommands([[...menu].flatMap(everyCommand)])) {
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
    contributions: menu,
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

const NOTE =
  "webviewId == 'lumiere.markdown.editor' && webviewSection == 'markdownContent'";
const format = (when = NOTE): MenuCommand[] => [
  {
    command: "lumiere.markdown.toggleBold",
    title: "Toggle Bold",
    shortTitle: "Bold",
    group: "formatting@1",
    when,
  },
  {
    command: "lumiere.markdown.toggleItalics",
    title: "Toggle Italics",
    shortTitle: "Italics",
    group: "formatting@2",
    when,
  },
];
/** The note's menu as menus.json gives it: Copy Link, then Format and Insert submenus. */
const noteMenu: MenuContribution[] = [
  {
    submenu: "lumiere.markdown.menu.insert",
    title: "Insert",
    group: "formatting@3",
    when: "webviewId == 'lumiere.markdown.editor'",
    items: [
      {
        command: "lumiere.markdown.insertLink",
        title: "Insert Link",
        shortTitle: "Link",
        group: "insert@1",
        when: `${NOTE} && lumiere.markdown.plugin.formatting`,
      },
    ],
  },
  {
    submenu: "lumiere.markdown.menu.format",
    title: "Format",
    group: "formatting@1",
    when: "webviewId == 'lumiere.markdown.editor'",
    items: format(`${NOTE} && lumiere.markdown.plugin.formatting`),
  },
  contributions[2] as MenuCommand,
];
const noteKeys: Record<string, unknown> = {
  webviewId: EDITOR,
  webviewSection: "markdownContent",
  "lumiere.markdown.hasSelection": true,
  "lumiere.markdown.plugin.agentBridge": true,
  "lumiere.markdown.plugin.formatting": true,
};

test("a submenu shows as one row holding its items, ordered as VS Code orders them", () => {
  const groups = menuGroups(noteMenu, (key) => noteKeys[key]);
  assert.deepEqual(menuRows(groups), [
    [{ label: "Copy Link for Agent" }],
    [
      {
        label: "Format",
        // Inside a submenu, its label says the rest: Format, then Bold.
        submenu: [[{ label: "Bold" }, { label: "Italics" }]],
      },
      { label: "Insert", submenu: [[{ label: "Link" }]] },
    ],
  ]);
});

test("a submenu whose items all hide is not shown, as VS Code hides it", () => {
  const keys: Record<string, unknown> = {
    ...noteKeys,
    "lumiere.markdown.plugin.formatting": false,
  };
  const groups = menuGroups(noteMenu, (key) => keys[key]);
  assert.deepEqual(menuRows(groups), [[{ label: "Copy Link for Agent" }]]);
  const outside: Record<string, unknown> = {
    ...noteKeys,
    webviewId: "lumiere.pdf.viewer",
  };
  assert.deepEqual(
    menuGroups(noteMenu, (key) => outside[key]),
    [],
  );
});

/** The page's number for each command row: what it answers when the row is chosen. */
function pageNumbers(groups: readonly MenuEntry[][]): [string, number][] {
  return groups.flat().flatMap((entry): [string, number][] => {
    if ("groups" in entry) {
      return pageNumbers(entry.groups);
    }
    return typeof entry.run === "number" ? [[entry.label, entry.run]] : [];
  });
}

test("the page numbers a submenu's rows as the host counts them, so its answer runs that row", () => {
  const groups = menuGroups(noteMenu, (key) => noteKeys[key]);
  const commands = menuCommands(groups);
  const numbered = pageNumbers(menuEntries(menuRows(groups)));
  assert.deepEqual(
    numbered.map(([label, index]) => [label, commands[index]?.command]),
    [
      ["Copy Link for Agent", "lumiere.markdown.copyLinkForAgent"],
      ["Bold", "lumiere.markdown.toggleBold"],
      ["Italics", "lumiere.markdown.toggleItalics"],
      ["Link", "lumiere.markdown.insertLink"],
    ],
  );
});

test("menus.json's submenus are read with their items; anything else is dropped", () => {
  const parsed = parseMenus([
    {
      submenu: "lumiere.markdown.menu.format",
      title: "Format",
      group: "formatting@1",
      when: 3,
      items: [
        {
          command: "lumiere.markdown.toggleBold",
          title: "Toggle Bold",
          shortTitle: "Bold",
          extra: true,
        },
        { command: "lumiere.markdown.noTitle" },
        "junk",
      ],
    },
    { submenu: "lumiere.markdown.menu.empty", title: "Empty", items: "no" },
    { title: "Neither" },
    null,
  ]);
  assert.deepEqual(parsed, [
    {
      submenu: "lumiere.markdown.menu.format",
      title: "Format",
      group: "formatting@1",
      items: [
        {
          command: "lumiere.markdown.toggleBold",
          title: "Toggle Bold",
          shortTitle: "Bold",
        },
      ],
    },
    { submenu: "lumiere.markdown.menu.empty", title: "Empty", items: [] },
  ]);
  assert.deepEqual(parseMenus({ not: "a list" }), []);
});

test("submenus nested deeper than a menu needs are dropped", () => {
  let nested: unknown = [{ command: "lumiere.markdown.deep", title: "Deep" }];
  for (let depth = 0; depth < 8; depth++) {
    nested = [{ submenu: `s${depth}`, title: `S${depth}`, items: nested }];
  }
  let depth = 0;
  for (
    let items = parseMenus(nested);
    items[0] && "submenu" in items[0];
    items = items[0].items
  ) {
    depth++;
  }
  // Five levels of submenus are more than any menu needs.
  assert.equal(depth, 5);
});

test("a row chosen inside a submenu runs its command with the element's context", async () => {
  const { commands, ran, page } = setUp(2, noteMenu);
  for (const key of ["agentBridge", "formatting"]) {
    await commands.execute(
      "setContext",
      `lumiere.markdown.plugin.${key}`,
      true,
    );
  }
  page.rightClick({ webviewSection: "markdownContent" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual((page.asked[0] as { groups: unknown }).groups, [
    [
      { label: "Format", submenu: [[{ label: "Bold" }, { label: "Italics" }]] },
      { label: "Insert", submenu: [[{ label: "Link" }]] },
    ],
  ]);
  assert.deepEqual(ran, [
    [
      "lumiere.markdown.insertLink",
      { webview: EDITOR, webviewSection: "markdownContent" },
    ],
  ]);
});

test("menus.json carries package.json's submenus with their labels, items and short titles", async () => {
  // menus.mjs runs in Node at build time, outside the typed sources.
  const { lumiereMenus } = (await import(
    "../../scripts/menus.mjs" as string
  )) as {
    lumiereMenus: (contributes: unknown) => unknown;
  };
  const written = lumiereMenus({
    commands: [
      {
        command: "lumiere.markdown.toggleBold",
        title: "Toggle Bold",
        shortTitle: "Bold",
      },
      {
        command: "lumiere.markdown.copyLinkForAgent",
        title: "Copy Link for Agent",
      },
      { command: "lumiere.pdf.fitWidth", title: "Fit Width" },
    ],
    submenus: [{ id: "lumiere.markdown.menu.format", label: "Format" }],
    menus: {
      "webview/context": [
        { command: "lumiere.markdown.copyLinkForAgent", group: "0_agent@1" },
        {
          submenu: "lumiere.markdown.menu.format",
          group: "formatting@1",
          when: "w",
        },
        { command: "lumiere.pdf.fitWidth" },
      ],
      "lumiere.markdown.menu.format": [
        { command: "lumiere.markdown.toggleBold", group: "formatting@1" },
      ],
    },
  });
  assert.deepEqual(written, [
    {
      command: "lumiere.markdown.copyLinkForAgent",
      group: "0_agent@1",
      title: "Copy Link for Agent",
    },
    {
      submenu: "lumiere.markdown.menu.format",
      group: "formatting@1",
      when: "w",
      title: "Format",
      items: [
        {
          command: "lumiere.markdown.toggleBold",
          group: "formatting@1",
          title: "Toggle Bold",
          shortTitle: "Bold",
        },
      ],
    },
  ]);
  assert.deepEqual(parseMenus(written), written);
});
