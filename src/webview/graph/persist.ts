export interface GraphViewState {
  mode: "global" | "local";
  depth: number;
  colorBy: "type" | "folder" | "tag";
  filters: {
    types: string[];
    tags: string[];
    folders: string[];
    text: string;
    orphans: boolean;
    conformantOnly: boolean;
  };
}

export interface PersistedGraph extends GraphViewState {
  saved: boolean;
  camera?: { x: number; y: number; ratio: number; angle: number };
  positions: Record<string, { x: number; y: number }>;
}

export function defaultView(): GraphViewState {
  return {
    mode: "global",
    depth: 2,
    colorBy: "type",
    filters: {
      types: [],
      tags: [],
      folders: [],
      text: "",
      orphans: false,
      conformantOnly: false,
    },
  };
}

/** Restore a previous panel. Anything unexpected falls back to a fresh view. */
export function readPersisted(value: unknown): PersistedGraph {
  const view = defaultView();
  if (!isRecord(value)) {
    return { ...view, saved: false, positions: {} };
  }
  const camera = cameraOf(value.camera);
  return {
    mode: value.mode === "local" ? "local" : "global",
    depth: numberIn(value.depth, 1, 3, 2),
    colorBy: colorOf(value.colorBy),
    filters: filtersOf(value.filters),
    saved: true,
    positions: positionsOf(value.positions),
    ...(camera ? { camera } : {}),
  };
}

function filtersOf(value: unknown): GraphViewState["filters"] {
  const filters = defaultView().filters;
  if (!isRecord(value)) {
    return filters;
  }
  return {
    types: strings(value.types),
    tags: strings(value.tags),
    folders: strings(value.folders),
    text: typeof value.text === "string" ? value.text.slice(0, 200) : "",
    orphans: value.orphans === true,
    conformantOnly: value.conformantOnly === true,
  };
}

function cameraOf(value: unknown): PersistedGraph["camera"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const x = value.x;
  const y = value.y;
  const ratio = value.ratio;
  const angle = value.angle;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof ratio !== "number" ||
    typeof angle !== "number"
  ) {
    return undefined;
  }
  return { x, y, ratio, angle };
}

function positionsOf(value: unknown): PersistedGraph["positions"] {
  if (!isRecord(value)) {
    return {};
  }
  const positions: PersistedGraph["positions"] = {};
  for (const [id, point] of Object.entries(value)) {
    if (
      !isRecord(point) ||
      typeof point.x !== "number" ||
      typeof point.y !== "number"
    ) {
      continue;
    }
    positions[id] = { x: point.x, y: point.y };
  }
  return positions;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, 50);
}

function colorOf(value: unknown): GraphViewState["colorBy"] {
  if (value === "folder" || value === "tag") {
    return value;
  }
  return "type";
}

function numberIn(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
