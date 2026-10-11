/**
 * OKF page contract shared by wiki, scratch and Marp. A deck or note inside
 * the bundle is a page only when it already has `type` and `generated`
 * provenance. Callers must not invent those fields to silence a diagnostic.
 */

const PUBLICATION_KEYS = [
  "published",
  "date",
  "captured",
  "last_modified",
] as const;

export interface PageContract {
  readonly ok: boolean;
  readonly missing: readonly string[];
}

export function pageContract(
  values: Record<string, unknown> | undefined,
): PageContract {
  const missing: string[] = [];
  if (typeof values?.type !== "string" || values.type.trim() === "") {
    missing.push("type");
  }
  const generated = values?.generated;
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) {
    missing.push("generated");
  } else {
    const record = generated as Record<string, unknown>;
    if (typeof record.by !== "string" || record.by.trim() === "") {
      missing.push("generated.by");
    }
    if (typeof record.at !== "string" || record.at.trim() === "") {
      missing.push("generated.at");
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * When the source itself was published or captured. This is not the
 * selection's capture time, and it is not `generated.at`.
 */
export function publicationTime(
  values: Record<string, unknown> | undefined,
): string | undefined {
  if (!values) {
    return undefined;
  }
  for (const key of PUBLICATION_KEYS) {
    const value = values[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

export function frontmatterType(
  values: Record<string, unknown> | undefined,
): string | undefined {
  const type = values?.type;
  if (typeof type !== "string" || type.trim() === "") {
    return undefined;
  }
  return type.trim();
}

/** Quote a YAML scalar so colons and spaces stay Properties-friendly. */
export function yamlScalar(value: string): string {
  return JSON.stringify(value);
}
