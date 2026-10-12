import { uniqueFileName } from "../../shared/file-name";
import { isInsidePath, safeRelative } from "../../shared/workspace-path";

export type AssetChoice = "replace" | "keep-both";

export type AssetPlan =
  | { readonly kind: "refuse"; readonly reason: string }
  | { readonly kind: "choose"; readonly fileName: string }
  | {
      readonly kind: "ready";
      readonly relativePath: string;
      readonly mkdir: boolean;
    };

export function planAssetImport(input: {
  readonly assetsPath: string;
  readonly bundle?: string;
  readonly originalName: string;
  readonly existingNames: readonly string[];
  readonly directoryExists: boolean;
  readonly choice?: AssetChoice;
}): AssetPlan {
  const assets = safeRelative(input.assetsPath);
  if (!assets) {
    return {
      kind: "refuse",
      reason: "The assets path must stay inside the project.",
    };
  }
  if (input.bundle && isInsidePath(input.bundle, assets)) {
    return {
      kind: "refuse",
      reason:
        "Assets stay outside the wiki bundle. Change the assets path in .wiki/layout.json.",
    };
  }
  const fileName = fileBaseName(input.originalName);
  if (!fileName) {
    return { kind: "refuse", reason: "Choose a file with a name." };
  }
  const conflict = conflictingName(input.existingNames, fileName);
  if (conflict && !input.choice) {
    return { kind: "choose", fileName: conflict };
  }
  const stored =
    conflict && input.choice === "keep-both"
      ? keepBothName(fileName, input.existingNames)
      : (conflict ?? fileName);
  return {
    kind: "ready",
    relativePath: `${assets}/${stored}`,
    mkdir: !input.directoryExists,
  };
}

/** A new name that does not collide, including a different-cased existing file. */
export function keepBothName(
  name: string,
  existing: readonly string[],
): string {
  const taken = existing.some(
    (item) => item.toLowerCase() === name.toLowerCase(),
  )
    ? existing
    : [...existing, name];
  return uniqueFileName(name, taken);
}

function conflictingName(
  existing: readonly string[],
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  return existing.find((item) => item.toLowerCase() === lower);
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32) {
      return true;
    }
  }
  return false;
}

function fileBaseName(name: string): string | undefined {
  const base = name.split(/[/\\]/).pop() ?? "";
  if (!base || base === "." || base === ".." || hasControlCharacter(base)) {
    return undefined;
  }
  return base;
}
