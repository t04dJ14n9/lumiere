import type { HostSettings } from "../../shared/host";
import { HARD_MAX_EDGES, HARD_MAX_NODES } from "./admission";

export interface GraphSettings {
  maxNodes: number;
  maxEdges: number;
  mode: "global" | "local";
  depth: number;
  colorBy: "type" | "folder" | "tag";
}

/** Window settings, clamped to the hard caps. A non-number falls back. */
export function readGraphSettings(
  settings: Pick<HostSettings, "get">,
): GraphSettings {
  return {
    maxNodes: readNumber(
      settings,
      "graph.maxNodes",
      HARD_MAX_NODES,
      HARD_MAX_NODES,
    ),
    maxEdges: readNumber(
      settings,
      "graph.maxEdges",
      HARD_MAX_EDGES,
      HARD_MAX_EDGES,
    ),
    mode: readChoice(
      settings,
      "graph.defaultMode",
      ["global", "local"],
      "global",
    ),
    depth: readNumber(settings, "graph.localDepth", 2, 3),
    colorBy: readChoice(
      settings,
      "graph.colorBy",
      ["type", "folder", "tag"],
      "type",
    ),
  };
}

function readNumber(
  settings: Pick<HostSettings, "get">,
  key: string,
  fallback: number,
  hard: number,
): number {
  const value = settings.get(key, fallback);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(hard, Math.max(1, Math.floor(value)));
}

function readChoice<T extends string>(
  settings: Pick<HostSettings, "get">,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = settings.get(key, fallback);
  for (const option of allowed) {
    if (value === option) {
      return option;
    }
  }
  return fallback;
}
