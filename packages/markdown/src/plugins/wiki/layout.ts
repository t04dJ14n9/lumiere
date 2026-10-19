import { safeRelative } from "../../shared/workspace-path";
import type { ResolvedLayout } from "./api";

export interface LayoutRead {
  readonly ok: boolean;
  readonly layout?: ResolvedLayout;
  readonly message?: string;
}

const PATH_KEYS = ["bundle", "assets", "inbox", "exports", "scratch"] as const;

/** Missing `layout.json` still means preset `legacy`. It does not invent collection folders. */
export function legacyLayout(bundle = "knowledge"): ResolvedLayout {
  return {
    preset: "legacy",
    bundle,
    assets: "assets",
    inbox: "inbox",
    exports: "exports",
    scratch: "scratch",
    dirs: {},
    source: "legacy",
  };
}

/**
 * Reads schema 1. Unknown keys (`code`, `descriptions`, later additions) are
 * ignored so a newer layout file still loads. A bad path fails the whole file.
 */
export function parseLayout(text: string): LayoutRead {
  const value = parseJson(text);
  if (!value.ok) {
    return value;
  }
  if (value.data.schema !== 1) {
    return { ok: false, message: "layout.json schema must be 1." };
  }
  const paths = readPaths(value.data);
  if (!paths.ok) {
    return paths;
  }
  const dirs = readDirs(value.data.dirs);
  if (!dirs.ok) {
    return dirs;
  }
  const preset = readPreset(value.data.preset);
  if (!preset.ok) {
    return preset;
  }
  return {
    ok: true,
    layout: {
      preset: preset.value,
      bundle: paths.values.bundle,
      assets: paths.values.assets,
      inbox: paths.values.inbox,
      exports: paths.values.exports,
      scratch: paths.values.scratch,
      dirs: dirs.values,
      source: "layout",
    },
  };
}

export function parseManifestBundle(text: string): LayoutRead {
  const value = parseJson(text);
  if (!value.ok) {
    return {
      ok: false,
      message: value.message ?? "Could not read manifest.json",
    };
  }
  const bundle = value.data.bundle;
  if (bundle === undefined) {
    return { ok: true, layout: legacyLayout() };
  }
  const path = typeof bundle === "string" ? safeRelative(bundle) : undefined;
  if (!path) {
    return {
      ok: false,
      message: "manifest.json bundle must be a relative path.",
    };
  }
  return { ok: true, layout: legacyLayout(path) };
}

export interface RegistryRead {
  readonly ok: boolean;
  readonly message?: string;
  readonly bundle?: string;
  readonly preset?: string;
  readonly types: Readonly<Record<string, string>>;
}

export function parseRegistry(text: string): RegistryRead {
  const value = parseJson(text);
  if (!value.ok) {
    return registryFailure(value.message);
  }
  const types = readTypes(value.data.types);
  if (!types.ok) {
    return registryFailure(types.message);
  }
  const bundle = registryPath(value.data.bundle, "bundle");
  const preset = value.data.preset;
  if (!bundle.ok) {
    return registryFailure(bundle.message);
  }
  if (preset !== undefined && typeof preset !== "string") {
    return {
      ok: false,
      message: "registry.json preset must be a string.",
      types: {},
    };
  }
  return {
    ok: true,
    types: types.values,
    ...(bundle.value ? { bundle: bundle.value } : {}),
    ...(typeof preset === "string" ? { preset } : {}),
  };
}

function registryFailure(message: string | undefined): RegistryRead {
  return {
    ok: false,
    message: message ?? "Could not read registry.json",
    types: {},
  };
}

function registryPath(
  value: unknown,
  label: string,
): { ok: boolean; message?: string; value?: string } {
  if (value === undefined) {
    return { ok: true };
  }
  const path = typeof value === "string" ? safeRelative(value) : undefined;
  if (!path) {
    return {
      ok: false,
      message: `registry.json ${label} must be a relative path.`,
    };
  }
  return { ok: true, value: path };
}

function readPaths(data: Record<string, unknown>): {
  ok: boolean;
  message?: string;
  values: Record<(typeof PATH_KEYS)[number], string>;
} {
  const defaults = {
    bundle: "knowledge",
    assets: "assets",
    inbox: "inbox",
    exports: "exports",
    scratch: "scratch",
  };
  const values = { ...defaults };
  for (const key of PATH_KEYS) {
    const raw = data[key];
    if (raw === undefined) {
      continue;
    }
    const path = typeof raw === "string" ? safeRelative(raw) : undefined;
    if (!path) {
      return {
        ok: false,
        message: `layout.json ${key} must be a relative path.`,
        values,
      };
    }
    values[key] = path;
  }
  return { ok: true, values };
}

function readDirs(value: unknown): {
  ok: boolean;
  message?: string;
  values: Record<string, string>;
} {
  if (value === undefined) {
    return { ok: true, values: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      message: "layout.json dirs must be an object.",
      values: {},
    };
  }
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key) || typeof raw !== "string") {
      return {
        ok: false,
        message: `layout.json dirs.${key} is invalid.`,
        values: {},
      };
    }
    const path = safeRelative(raw);
    if (!path) {
      return {
        ok: false,
        message: `layout.json dirs.${key} must be a relative path.`,
        values: {},
      };
    }
    values[key] = path;
  }
  return { ok: true, values };
}

function readPreset(value: unknown): {
  ok: boolean;
  message?: string;
  value: string;
} {
  if (value === undefined) {
    return { ok: true, value: "custom" };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      message: "layout.json preset must be a string.",
      value: "",
    };
  }
  return { ok: true, value: value.trim() };
}

function readTypes(value: unknown): {
  ok: boolean;
  message?: string;
  values: Record<string, string>;
} {
  if (value === undefined) {
    return { ok: true, values: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      message: "registry.json types must be an object.",
      values: {},
    };
  }
  const values: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        message: `registry.json types.${name} must be an object.`,
        values: {},
      };
    }
    const folder = (raw as Record<string, unknown>).folder;
    if (folder === undefined) {
      continue;
    }
    if (typeof folder !== "string" || folder.trim() === "") {
      return {
        ok: false,
        message: `registry.json types.${name}.folder is invalid.`,
        values: {},
      };
    }
    values[name] = folder.trim();
  }
  return { ok: true, values };
}

function parseJson(text: string): {
  ok: boolean;
  message?: string;
  data: Record<string, unknown>;
} {
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, message: "Expected a JSON object.", data: {} };
    }
    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Invalid JSON.", data: {} };
  }
}
