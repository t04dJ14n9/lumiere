import type { HostViews } from "../../shared/runtime";
import { HARD_MAX_EDGES, HARD_MAX_NODES } from "./admission";

export interface GraphSettings {
  maxNodes: number;
  maxEdges: number;
  mode: "global" | "local";
  depth: number;
  colorBy: "type" | "folder" | "tag";
}

/** Window settings, clamped to the hard caps. A non-number falls back. */
export function readGraphSettings(views: HostViews | undefined): GraphSettings {
  return {
    maxNodes: readNumber(
      views,
      "graph.maxNodes",
      HARD_MAX_NODES,
      HARD_MAX_NODES,
    ),
    maxEdges: readNumber(
      views,
      "graph.maxEdges",
      HARD_MAX_EDGES,
      HARD_MAX_EDGES,
    ),
    mode: readChoice(views, "graph.defaultMode", ["global", "local"], "global"),
    depth: readNumber(views, "graph.localDepth", 2, 3),
    colorBy: readChoice(
      views,
      "graph.colorBy",
      ["type", "folder", "tag"],
      "type",
    ),
  };
}

function readNumber(
  views: HostViews | undefined,
  key: string,
  fallback: number,
  hard: number,
): number {
  const value = views?.setting(key, fallback);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(hard, Math.max(1, Math.floor(value)));
}

function readChoice<T extends string>(
  views: HostViews | undefined,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = views?.setting(key, fallback);
  for (const option of allowed) {
    if (value === option) {
      return option;
    }
  }
  return fallback;
}
