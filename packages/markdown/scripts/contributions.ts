import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import type { Manifest } from "../src/shared/manifest";
import {
  EDITOR_SUBMENUS,
  type EditorSubmenu,
} from "../src/shared/editor-menus";
import {
  MARKDOWN_EDITOR,
  whenActive,
  whenWebview,
} from "../src/shared/editor-provider";
import { contributionId, SETTING_PREFIX } from "../src/shared/setting-schema";
const pluginsDirectory = fileURLToPath(
  new URL("../src/plugins", import.meta.url),
);

/** Lumière's `contributes`, generated from its plugin manifests. */
export async function contributions() {
  const manifests: Manifest[] = [];
  for (const directory of readdirSync(pluginsDirectory, {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory())) {
    const file = path.resolve(pluginsDirectory, directory.name, "manifest.ts");
    if (!existsSync(file)) {
      continue;
    }
    const module = (await import(pathToFileURL(file).href)) as {
      default: Manifest;
    };
    manifests.push(module.default);
  }
  const commands = manifests.flatMap((manifest) =>
    (manifest.contributes?.commands ?? []).map((command) => ({
      command: contributionId(command.id),
      title: command.title,
      category: "Lumière",
      ...(command.icon ? { icon: command.icon } : {}),
      ...(command.shortTitle ? { shortTitle: command.shortTitle } : {}),
    })),
  );
  const submenus = editorSubmenus(manifests);
  const noteMenu: NoteMenuEntry[] = [
    ...manifestMenus(manifests, "webview/context"),
    ...submenus.entries,
  ];
  const menus = manifests.flatMap((manifest) =>
    (manifest.contributes?.commands ?? []).map((command) =>
      withWhen(
        { command: contributionId(command.id) },
        command.palette === false
          ? "false"
          : contributionWhen(manifest, command),
      ),
    ),
  );
  const views = manifests.flatMap((manifest) =>
    (manifest.contributes?.views ?? []).map((view) => ({
      id: contributionId(view.id),
      name: view.name,
      when: [whenEnabled(manifest, view.scope), view.when]
        .filter(Boolean)
        .join(" && "),
      ...(view.visibility ? { visibility: view.visibility } : {}),
    })),
  );
  return {
    customEditors: [
      {
        viewType: MARKDOWN_EDITOR.viewType,
        displayName: MARKDOWN_EDITOR.displayName,
        selector: MARKDOWN_EDITOR.filenamePatterns.map((filenamePattern) => ({
          filenamePattern,
        })),
        priority: MARKDOWN_EDITOR.priority,
      },
    ],
    commands,
    submenus: submenus.submenus,
    keybindings: manifests.flatMap((manifest) =>
      [
        ...(manifest.contributes?.commands ?? []).filter(
          (command) => command.key,
        ),
        ...(manifest.contributes?.keybindings ?? []),
      ].map((command) =>
        withWhen(
          {
            command: contributionId(command.id),
            key: command.key,
            ...(command.mac ? { mac: command.mac } : {}),
          },
          contributionKeyWhen(manifest, command),
        ),
      ),
    ),
    ...(views.length > 0 ? { views: { explorer: views } } : {}),
    menus: {
      commandPalette: menus,
      "webview/context": noteMenu,
      ...submenus.menus,
      "view/title": manifestMenus(manifests, "view/title"),
      "editor/title": [
        ...manifestMenus(manifests, "editor/title"),
        {
          command: contributionId("openAsText"),
          when: `${whenActive(MARKDOWN_EDITOR)} && ${contributionId("plugin.commands")}`,
          group: "navigation",
        },
      ],
    },
    configuration: {
      title: "Lumière",
      properties: {
        ...Object.fromEntries(
          manifests
            .filter((manifest) => manifest.kind === "feature")
            .map((manifest) => [
              contributionId(`plugins.${manifest.id}.enabled`),
              {
                type: "boolean",
                default: manifest.defaultEnabled,
                scope: "resource",
                description: manifest.description,
              },
            ]),
        ),
        ...Object.fromEntries(
          manifests.flatMap((manifest) =>
            Object.entries(
              (manifest.config?.toJSONSchema().properties as Record<
                string,
                Record<string, unknown>
              >) ?? {},
            )
              // Fields backed by a native VS Code setting contribute nothing.
              .filter(([key]) => !manifest.nativeConfigKeys?.[key])
              .map(([key, value]) => [
                contributionId(
                  manifest.configKeys?.[key] ?? `${manifest.id}.${key}`,
                ),
                { ...value, scope: "resource" },
              ]),
          ),
        ),
        [contributionId("copyLinkForAgent.target")]: {
          type: "string",
          enum: ["auto", "cursor", "chat", "claudeCode", "codex", "clipboard"],
          enumDescriptions: [
            "The editor's own chat (Cursor, or VS Code with a chat extension such as Copilot Chat) when it is the only agent installed; with Claude Code or Codex installed too, only copy, to paste into the agent you use.",
            "Cursor's agent chat, with the passage on the clipboard to paste.",
            "VS Code's chat, with the passage typed in.",
            "Claude Code: a new conversation with the passage typed in.",
            "Codex: the passage attached to the thread as a file.",
            "Only copy the passage.",
          ],
          default: "auto",
          scope: "window",
          markdownDescription:
            "Which chat **Copy Link for Agent** opens after copying the link and passage. Extensions cannot see which agent you are working in, so `auto` only opens a chat when the editor's own chat is the only agent; pick one here to send the passage to it.",
        },
        [contributionId("debug.logging")]: {
          type: "boolean",
          default: false,
          scope: "window",
          description:
            "Log plugin load/stop timings and debug messages in the Lumière output channel.",
        },
        [contributionId("plugins.external")]: {
          type: "object",
          default: {},
          additionalProperties: { type: "boolean" },
          scope: "resource",
          description:
            "External host plugin enablement by registered plugin ID.",
        },
        [contributionId("preset")]: {
          type: "string",
          enum: ["obsidian", "minimal"],
          default: "obsidian",
          scope: "resource",
          description: "Editor plugin preset.",
        },
      },
    },
  };
}
/**
 * The when-clause for a plugin's command or view. In the editor, the editor
 * host keeps `lumiere.markdown.plugin.<id>` current for the active panel.
 * Elsewhere, the plugin's setting decides.
 */
/** Adds a `when` clause unless the contribution applies everywhere. */
function withWhen<T extends object>(
  item: T,
  when: string,
): T & { when?: string } {
  return when ? { ...item, when } : item;
}

/** Plugin enablement plus an optional per-command `when` fragment (B3). */
function contributionWhen(
  manifest: Manifest,
  contribution: { scope?: "editor" | "workbench"; when?: string },
): string {
  return [whenEnabled(manifest, contribution.scope), contribution.when]
    .filter(Boolean)
    .join(" && ");
}

function whenEnabled(
  manifest: Manifest,
  scope: "editor" | "workbench" = "editor",
): string {
  if (scope === "editor") {
    return `${whenActive(MARKDOWN_EDITOR)} && ${contributionId(`plugin.${manifest.id}`)}`;
  }
  if (manifest.kind === "core") {
    // Core workbench commands (plugin management, the editor association)
    // must work in the minimal preset too: it is the safe mode for
    // diagnosing plugins.
    return "";
  }
  return `config.${contributionId("preset")} != 'minimal' && config.${contributionId(`plugins.${manifest.id}.enabled`)}`;
}

/**
 * Keybinding when-clause: plugin enablement, optional per-command `when`
 * (B3), then editorFocus for editor-scoped keys. A note's keys also need the
 * note to have focus: VS Code keeps `activeCustomEditorId` while focus is in
 * the Explorer or a chat, and an extension binding outranks the built-in one
 * for the same key, so Cmd+B there would bold the note instead of toggling
 * the sidebar. editorFocus is last so the contributions test can assert every
 * note key ends with it.
 */
function contributionKeyWhen(
  manifest: Manifest,
  contribution: { scope?: "editor" | "workbench"; when?: string },
): string {
  const parts = [
    whenEnabled(manifest, contribution.scope),
    contribution.when,
  ].filter(Boolean);
  if ((contribution.scope ?? "editor") === "editor") {
    parts.push(contributionId("editorFocus"));
  }
  return parts.join(" && ");
}

/**
 * webview/context must use `webviewId` (VS Code docs), not
 * `activeCustomEditorId`. The latter is a workbench key that is not always
 * true while the webview context menu is built (seen on Windows/Cursor
 * remote as Cut/Copy/Paste only — no Copy Link for Agent / formatting).
 * PDF already gates on webviewId; match that.
 */
function menuEnablement(
  manifest: Manifest,
  location: "editor/title" | "webview/context" | "view/title",
): string {
  if (location === "view/title") {
    return whenEnabled(manifest, "workbench");
  }
  if (location === "webview/context") {
    return `${whenWebview(MARKDOWN_EDITOR)} && ${contributionId(`plugin.${manifest.id}`)}`;
  }
  return whenEnabled(manifest, "editor");
}

function manifestMenus(
  manifests: readonly Manifest[],
  location: "editor/title" | "webview/context" | "view/title",
  submenu?: EditorSubmenu,
) {
  return manifests.flatMap((manifest) =>
    (manifest.contributes?.menus ?? [])
      .filter((menu) => menu.location === location && menu.submenu === submenu)
      .map((menu) => ({
        command: contributionId(menu.command),
        when: [menuEnablement(manifest, location), menu.when]
          .filter(Boolean)
          .join(" && "),
        ...(menu.group ? { group: menu.group } : {}),
      })),
  );
}

/** An entry of the note's menu: a command, or a submenu of commands. */
interface NoteMenuEntry {
  readonly command?: string;
  readonly submenu?: string;
  readonly when: string;
  readonly group?: string;
}

/**
 * The note menu's submenus that some plugin fills: VS Code's `submenus`,
 * an entry for each in `webview/context`, and each one's items as a menu
 * of its own.
 */
function editorSubmenus(manifests: readonly Manifest[]) {
  const filled = (Object.keys(EDITOR_SUBMENUS) as EditorSubmenu[]).filter(
    (id) =>
      manifests.some((manifest) =>
        (manifest.contributes?.menus ?? []).some((menu) => menu.submenu === id),
      ),
  );
  return {
    submenus: filled.map((id) => ({
      id: submenuId(id),
      label: EDITOR_SUBMENUS[id].label,
    })),
    // VS Code shows a submenu only while one of its items shows, so the
    // items' clauses decide; this one keeps it to the note's menu.
    entries: filled.map((id) => ({
      submenu: submenuId(id),
      when: whenWebview(MARKDOWN_EDITOR),
      group: EDITOR_SUBMENUS[id].group,
    })),
    menus: Object.fromEntries(
      filled.map((id) => [
        submenuId(id),
        manifestMenus(manifests, "webview/context", id),
      ]),
    ) as Partial<Record<SubmenuId, ReturnType<typeof manifestMenus>>>,
  };
}

type SubmenuId = `${typeof SETTING_PREFIX}menu.${EditorSubmenu}`;

function submenuId(id: EditorSubmenu): SubmenuId {
  return `${SETTING_PREFIX}menu.${id}`;
}
