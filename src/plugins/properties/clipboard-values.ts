import { parseDocument } from "yaml";

/** Menu paste uses the injected plain clipboard; keyboard paste keeps its MIME payload. */
export function clipboardProperties(
  text: string,
): Record<string, unknown> | undefined {
  if (text.length > 1_000_000) {
    return undefined;
  }
  try {
    const document = parseDocument(text, { uniqueKeys: true });
    if (document.errors.length) {
      return undefined;
    }
    const values: unknown = document.toJS({ maxAliasCount: 100 });
    return values && typeof values === "object" && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
