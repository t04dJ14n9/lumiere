import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

const node = Schema.object({
  id: Schema.string().max(1024),
  title: Schema.string().max(500),
  path: Schema.string().max(1024),
  description: Schema.string().max(4000).optional(),
  type: Schema.string().max(200).optional(),
  folder: Schema.string().max(1024),
  tags: Schema.array(Schema.string().max(200)).max(50),
  classification: Schema.union(["conformant", "nonconformant", "indexing"]),
  degree: Schema.number(),
  orphan: Schema.boolean(),
  unresolved: Schema.number(),
  color: Schema.string().max(16),
  colorKey: Schema.string().max(200),
});

const edge = Schema.object({
  id: Schema.string().max(2100),
  source: Schema.string().max(1024),
  target: Schema.string().max(1024),
  count: Schema.number(),
});

const filters = Schema.object({
  types: Schema.array(Schema.string().max(200)).max(50),
  tags: Schema.array(Schema.string().max(200)).max(50),
  folders: Schema.array(Schema.string().max(500)).max(50),
  text: Schema.string().max(200),
  orphans: Schema.boolean(),
  conformantOnly: Schema.boolean(),
});

export const snapshot = Schema.object({
  scopeId: Schema.string().max(2048),
  generation: Schema.number(),
  completeness: Schema.union(["ready", "partial", "indexing"]),
  bundleName: Schema.string().max(500),
  bundlePath: Schema.string().max(1024),
  mode: Schema.union(["global", "local"]),
  depth: Schema.number(),
  colorBy: Schema.union(["type", "folder", "tag"]),
  focusExcluded: Schema.boolean(),
  omittedConformant: Schema.number(),
  accepted: Schema.boolean(),
  nodeCount: Schema.number(),
  edgeCount: Schema.number(),
  reason: Schema.string().max(500).optional(),
  nodes: Schema.array(node).max(2000),
  edges: Schema.array(edge).max(20000),
  legend: Schema.array(
    Schema.object({
      key: Schema.string().max(200),
      color: Schema.string().max(16),
      count: Schema.number(),
    }),
  ).max(40),
  facets: Schema.object({
    types: Schema.array(Schema.string().max(200)).max(50),
    tags: Schema.array(Schema.string().max(200)).max(50),
    folders: Schema.array(Schema.string().max(500)).max(50),
  }),
});

const viewState = Schema.object({
  mode: Schema.union(["global", "local"]),
  depth: Schema.number(),
  colorBy: Schema.union(["type", "folder", "tag"]),
  filters,
  focusId: Schema.string().max(1024).optional(),
  relayout: Schema.boolean(),
  /** True when the webview is restoring a view the user already chose. */
  saved: Schema.boolean(),
});

export const protocol = defineProtocol("graph", {
  requests: {
    open: {
      params: Schema.object({
        scopeId: Schema.string().max(2048),
        nodeId: Schema.string().max(1024),
        generation: Schema.number(),
      }),
      result: Schema.object({ opened: Schema.boolean() }),
    },
    view: {
      params: viewState,
      result: Schema.object({}),
    },
    ready: {
      params: viewState,
      result: Schema.object({}),
    },
  },
  notifications: {
    snapshot,
    stopLayout: Schema.object({}),
  },
});
