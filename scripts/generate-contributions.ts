import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import type { Manifest } from "../src/shared/manifest";
export async function contributions() {
  const manifests: Manifest[] = [];
  for (const directory of readdirSync("src/plugins", {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory())) {
    const file = path.resolve("src/plugins", directory.name, "manifest.ts");
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
      command: `markdownWorkbench.${command.id}`,
      title: command.title,
      category: "Markdown Workbench",
      ...(command.icon ? { icon: command.icon } : {}),
    })),
  );
  const menus = manifests.flatMap((manifest) =>
    (manifest.contributes?.commands ?? []).map((command) => ({
      command: `markdownWorkbench.${command.id}`,
      when:
        command.palette === false
          ? "false"
          : whenEnabled(manifest, command.scope),
    })),
  );
  const views = manifests.flatMap((manifest) =>
    (manifest.contributes?.views ?? []).map((view) => ({
      id: `markdownWorkbench.${view.id}`,
      name: view.name,
      when: [whenEnabled(manifest, view.scope), view.when]
        .filter(Boolean)
        .join(" && "),
    })),
  );
  return {
    customEditors: [
      {
        viewType: "markdownWorkbench.editor",
        displayName: "Markdown Workbench",
        selector: [
          { filenamePattern: "*.md" },
          { filenamePattern: "*.markdown" },
        ],
        priority: "option",
      },
    ],
    commands,
    keybindings: manifests.flatMap((manifest) =>
      [
        ...(manifest.contributes?.commands ?? []).filter(
          (command) => command.key,
        ),
        ...(manifest.contributes?.keybindings ?? []),
      ].map((command) => ({
        command: `markdownWorkbench.${command.id}`,
        key: command.key,
        ...(command.mac ? { mac: command.mac } : {}),
        when: whenEnabled(manifest, command.scope),
      })),
    ),
    ...(views.length > 0 ? { views: { explorer: views } } : {}),
    menus: {
      commandPalette: menus,
      "webview/context": manifestMenus(manifests, "webview/context"),
      "editor/title": [
        ...manifestMenus(manifests, "editor/title"),
        {
          command: "markdownWorkbench.openAsText",
          when: "activeCustomEditorId == 'markdownWorkbench.editor' && markdownWorkbench.plugin.commands",
          group: "navigation",
        },
      ],
    },
    configuration: {
      title: "Markdown Workbench",
      properties: {
        ...Object.fromEntries(
          manifests
            .filter((manifest) => manifest.kind === "feature")
            .map((manifest) => [
              `markdownWorkbench.plugins.${manifest.id}.enabled`,
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
            ).map(([key, value]) => [
              `markdownWorkbench.${manifest.configKeys?.[key] ?? `${manifest.id}.${key}`}`,
              { ...value, scope: "resource" },
            ]),
          ),
        ),
        "markdownWorkbench.plugins.external": {
          type: "object",
          default: {},
          additionalProperties: { type: "boolean" },
          scope: "resource",
          description:
            "External host plugin enablement by registered plugin ID.",
        },
        "markdownWorkbench.preset": {
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
 * host keeps `markdownWorkbench.plugin.<id>` current for the active panel.
 * Elsewhere, the plugin's setting decides.
 */
function whenEnabled(
  manifest: Manifest,
  scope: "editor" | "workbench" = "editor",
): string {
  if (scope === "editor") {
    return `activeCustomEditorId == 'markdownWorkbench.editor' && markdownWorkbench.plugin.${manifest.id}`;
  }
  if (manifest.kind === "core") {
    return "config.markdownWorkbench.preset != 'minimal'";
  }
  return `config.markdownWorkbench.preset != 'minimal' && config.markdownWorkbench.plugins.${manifest.id}.enabled`;
}

async function main() {
  const file = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const generated = await contributions();
  if (process.argv.includes("--check")) {
    if (JSON.stringify(pkg.contributes) !== JSON.stringify(generated)) {
      throw new Error("Run pnpm contributions");
    }
  } else {
    pkg.contributes = generated;
    writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  }
}

if (process.argv[1]?.endsWith("generate-contributions.ts")) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

function manifestMenus(
  manifests: readonly Manifest[],
  location: "editor/title" | "webview/context",
) {
  return manifests.flatMap((manifest) =>
    (manifest.contributes?.menus ?? [])
      .filter((menu) => menu.location === location)
      .map((menu) => ({
        command: `markdownWorkbench.${menu.command}`,
        when: [whenEnabled(manifest), menu.when].filter(Boolean).join(" && "),
        ...(menu.group ? { group: menu.group } : {}),
      })),
  );
}
