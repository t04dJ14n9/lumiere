import { joinContained } from "../../shared/workspace-path";

/** Independent of core vault root markers (.git need not contain Obsidian config). */
export function resolveConfigDirectory(
  vaultRoot: string,
  configFolder = ".obsidian",
): string {
  if (/^([A-Za-z][A-Za-z0-9+.-]*:|[/\\])/.test(configFolder)) {
    throw new Error("Obsidian configuration folder must be inside the vault.");
  }
  const uri = joinContained(vaultRoot, configFolder);
  if (!uri) {
    throw new Error("Obsidian configuration folder must be inside the vault.");
  }
  return uri;
}
