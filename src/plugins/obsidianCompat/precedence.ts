import type { ConfigurationInspection } from "../../shared/configuration";

/** Defaults/languageIds are metadata; every global/workspace value is explicit. */
export function hasExplicitSetting(
  inspected: ConfigurationInspection | undefined,
): boolean {
  return Object.entries(inspected ?? {}).some(
    ([layer, value]) =>
      /^(global|workspace).*Value$/.test(layer) && value !== undefined,
  );
}
