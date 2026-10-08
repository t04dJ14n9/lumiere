/** Refreshes the generated manual inventory; existing owner parity observations are preserved. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { contributions } from "./generate-contributions";
const escape = (value: string) =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ");
async function main() {
  const generated = await contributions();
  const rows = generated.commands.map((command) => {
    const keys =
      generated.keybindings
        .filter((binding) => binding.command === command.command)
        .map((binding) =>
          binding.mac ? `${binding.key} (Mac ${binding.mac})` : binding.key,
        )
        .join("; ") || "unbound";
    const action = command.command.endsWith("consumeVimHostShortcut")
      ? "Enable Vim and press the listed keys; host commands must not steal them. This helper stays hidden from the palette."
      : `On a disposable fixture, run ${command.title}; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes.`;
    return `| \`${command.command}\` — ${escape(command.title)} | ${escape(keys)} | ${escape(action)} |`;
  });
  const settings = Object.entries(generated.configuration.properties).map(
    ([key, value]) => {
      const entry = value as {
        default?: unknown;
        enum?: unknown[];
        type?: string;
      };
      const values = entry.enum
        ? entry.enum.map(String).join(" / ")
        : (entry.type ?? "value");
      return `| \`${key}\` | \`${escape(JSON.stringify(entry.default))}\` | ${escape(values)}; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |`;
    },
  );
  const section = [
    "<!-- command-setting-inventory:start -->",
    "## Complete command and setting acceptance inventory",
    "",
    "Use a disposable copy of `test/fixtures/vault/Core.md`; add the note/table/properties described in each plugin scenario above. These rows enumerate every generated command and setting. No Obsidian observation is implied. All verify shortcuts remain unbound.",
    "",
    "| Command | Default keys | Procedure and expected outcome |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "| Setting | Default | Procedure |",
    "| --- | --- | --- |",
    ...settings,
    "",
    "Attachment folder is a validated destination policy; this release keeps pasted image links and does not import attachment files. `links.useWikilinks` changes suggestion acceptance; explicit Insert Wikilink retains wiki syntax. Strict line breaks affects rendered Markdown; source text and its line boundaries remain intact. Default mode affects newly opened panes, not restored pane state.",
    "<!-- command-setting-inventory:end -->",
  ].join("\n");
  const path = "docs/MANUAL_TEST_PLAN.md";
  const manual = readFileSync(path, "utf8");
  const pattern =
    /<!-- command-setting-inventory:start -->[\s\S]*?<!-- command-setting-inventory:end -->/;
  writeFileSync(
    path,
    pattern.test(manual)
      ? manual.replace(pattern, section)
      : `${manual}\n${section}\n`,
  );
  if (!existsSync("docs/PARITY.md")) {
    writeParity(generated);
  } else {
    const path = "docs/PARITY.md";
    const text = readFileSync(path, "utf8");
    const additions = [
      ...generated.commands.map((item) => `Command: ${item.command}`),
      ...Object.keys(generated.configuration.properties).map(
        (key) => `Setting: ${key}`,
      ),
    ]
      .filter((item) => !text.includes(item))
      .map(
        (item) =>
          `| ${item} | not observed | not manually observed | Manual scenario pending | not observed |`,
      );
    if (additions.length) {
      writeFileSync(path, text.trimEnd() + "\n" + additions.join("\n") + "\n");
    }
  }
}
function writeParity(generated: Awaited<ReturnType<typeof contributions>>) {
  const design = readFileSync("DESIGN.md", "utf8")
    .split("## 13.")[1]!
    .split("## 16.")[0]!;
  const actions: string[] = [];
  for (const line of design.split("\n")) {
    if (
      line.startsWith("| `") ||
      line.startsWith("| Obsidian") ||
      (line.startsWith("| ") &&
        !line.includes("---") &&
        !line.includes("Setting or plugin") &&
        !line.includes("VS Code command") &&
        !line.includes("ID |") &&
        !line.includes("Default |"))
    ) {
      if (!line.startsWith("| Obsidian")) {
        actions.push(line.split("|")[1]!.trim());
      }
    }
  }
  const details =
    design
      .split("Short specifications, beyond the source's tested behaviour:")[1]
      ?.split("## 14.")[0] ?? "";
  const bullets = details.replace(/\n(?!- )/g, " ").split(/\n- /);
  for (const bullet of bullets) {
    const normalized = bullet.replace(/^\s*-\s*/, "").trim();
    if (!normalized) {
      continue;
    }
    for (const clause of normalized.split(/;\s+|\.\s+(?=[A-Z])/)) {
      actions.push(clause);
    }
  }
  actions.push(
    ...generated.commands.map((item) => `Command: ${item.command}`),
    ...Object.keys(generated.configuration.properties).map(
      (key) => `Setting: ${key}`,
    ),
  );
  actions.push(
    "Selection-only Copy for Agent, Add File Property and Open as Text title actions",
    "Native static context menu; contextual table/property menus",
    "Vim host-collision keys only while Vim is enabled",
    "Vim :w, :q, :wq, :x, :u and :red",
    "Verify bindings left unbound",
    "VS Code owns save, undo/redo, hot exit and settings",
    "Theme follows VS Code colors",
    "Rename link updates prompt by default",
    "Native outline/backlinks/tags views",
    "External application schemes prompt; own application scheme opens directly",
  );
  const rows = [...new Set(actions)].map(
    (action) =>
      `| ${escape(action)} | not observed | not manually observed | Manual scenario pending; automated evidence is in phase records | not observed |`,
  );
  writeFileSync(
    "docs/PARITY.md",
    [
      "# Obsidian parity observations",
      "",
      "Reference: Obsidian 1.13.7, to be compared by the owner in a disposable vault. Never use the owner's vault. Record date, method, observed result and any issue link in each row. Automated checks do not establish visual or behavioral parity. All rows start not observed.",
      "",
      "| Action or behavior (DESIGN §13–§15) | Obsidian observation: date and method | Workbench result | How checked | Status |",
      "| --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
