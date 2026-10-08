import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import type { Manifest } from "../src/shared/manifest";
export async function contributions() {
  const manifests: Manifest[] = [];
  for (const directory of readdirSync("src/plugins", { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  )) {
    const file = path.resolve("src/plugins", directory.name, "manifest.ts");
    if (!existsSync(file)) continue;
    const module = (await import(pathToFileURL(file).href)) as { default: Manifest };
    manifests.push(module.default);
  }
  const commands = manifests.flatMap((manifest) =>
    (manifest.contributes?.commands ?? []).map((command) => ({
      command: `markdownWorkbench.${command.id}`,
      title: command.title,
      category: "Markdown Workbench",
    })),
  );
  const menus = manifests.flatMap((manifest) =>
    (manifest.contributes?.commands ?? []).map((command) => ({
      command: `markdownWorkbench.${command.id}`,
      when: `activeCustomEditorId == 'markdownWorkbench.editor' && markdownWorkbench.plugin.${manifest.id}`,
    })),
  );
  return {
    customEditors: [
      {
        viewType: "markdownWorkbench.editor",
        displayName: "Markdown Workbench",
        selector: [{ filenamePattern: "*.md" }, { filenamePattern: "*.markdown" }],
        priority: "option",
      },
    ],
    commands,
    menus: {
      commandPalette: menus,
      "editor/title": [
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
        "markdownWorkbench.preset": {
          type: "string",
          enum: ["obsidian", "minimal"],
          default: "obsidian",
          scope: "resource",
          description: "Editor plugin preset.",
        },
        "markdownWorkbench.editor.defaultMode": {
          type: "string",
          enum: ["livePreview", "source"],
          default: "livePreview",
          scope: "resource",
          description: "Initial editing mode.",
        },
      },
    },
  };
}
async function main() {
  const file = new URL("../package.json", import.meta.url),
    pkg = JSON.parse(readFileSync(file, "utf8"));
  const generated = await contributions();
  if (process.argv.includes("--check")) {
    if (JSON.stringify(pkg.contributes) !== JSON.stringify(generated))
      throw new Error("Run pnpm contributions");
  } else {
    pkg.contributes = generated;
    writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  }
}

if (process.argv[1]?.endsWith("generate-contributions.ts"))
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
