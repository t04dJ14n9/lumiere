import type { ActiveResource } from "./types";

export type ProductCanonicalSlice =
  | { product: "markdownWorkshop"; uri: string; selection?: ActiveResource["selection"] }
  | { product: "pdfWorkshop"; uri: string };

export interface HostActiveSnapshot {
  activeTextEditor?: {
    uri: string;
    languageId?: string;
    isDirty?: boolean;
    caret?: { line: number; character: number };
    selection?: ActiveResource["selection"];
  };
}

function normalizeUri(uri: string): string {
  return uri;
}

/**
 * Invoking workshop surface owns active; host activeTextEditor augments only on URI match.
 */
export function resolveCanonicalActive(
  productSlice: ProductCanonicalSlice,
  hostSnapshot: HostActiveSnapshot,
): { active: ActiveResource; warnings: string[] } {
  const warnings: string[] = [];
  const active: ActiveResource = { uri: productSlice.uri };

  if (productSlice.product === "markdownWorkshop" && productSlice.selection) {
    active.selection = productSlice.selection;
  }

  const host = hostSnapshot.activeTextEditor;
  if (!host) {
    return { active, warnings };
  }

  if (normalizeUri(host.uri) !== normalizeUri(productSlice.uri)) {
    warnings.push(
      "omitted host activeTextEditor fields: URI mismatch with canonical resource",
    );
    return { active, warnings };
  }

  if (host.languageId !== undefined) active.languageId = host.languageId;
  if (host.isDirty !== undefined) active.isDirty = host.isDirty;
  if (host.caret !== undefined) active.caret = host.caret;
  // Host selection only when product didn't already supply panel selection
  if (!active.selection && host.selection) {
    active.selection = host.selection;
  }
  return { active, warnings };
}
