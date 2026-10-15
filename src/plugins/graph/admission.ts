/** Hard caps. A confirmation cannot raise them, and nothing is sampled to fit. */
export const HARD_MAX_NODES = 2000;
export const HARD_MAX_EDGES = 20_000;
export const HARD_MAX_PAYLOAD_BYTES = 1_500_000;

export interface Admission {
  accepted: boolean;
  nodeCount: number;
  edgeCount: number;
  payloadBytes: number;
  reason?: string;
}

export function admit(
  nodes: readonly unknown[],
  edges: readonly unknown[],
  limits: { maxNodes: number; maxEdges: number },
): Admission {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const payloadBytes = byteLength(nodes, edges);
  const maxNodes = clamp(limits.maxNodes, HARD_MAX_NODES);
  const maxEdges = clamp(limits.maxEdges, HARD_MAX_EDGES);
  const reason = refusal({
    nodeCount,
    edgeCount,
    payloadBytes,
    maxNodes,
    maxEdges,
  });
  return {
    accepted: reason === undefined,
    nodeCount,
    edgeCount,
    payloadBytes,
    ...(reason ? { reason } : {}),
  };
}

export function isCurrentGeneration(
  applied: number,
  incoming: number,
): boolean {
  return incoming > applied;
}

function refusal(input: {
  nodeCount: number;
  edgeCount: number;
  payloadBytes: number;
  maxNodes: number;
  maxEdges: number;
}): string | undefined {
  const { nodeCount, edgeCount, payloadBytes, maxNodes, maxEdges } = input;
  if (nodeCount > maxNodes) {
    return `This graph has ${nodeCount} notes. Narrow the bundle or filters below ${maxNodes}.`;
  }
  if (edgeCount > maxEdges) {
    return `This graph has ${edgeCount} links. Narrow the bundle or filters below ${maxEdges}.`;
  }
  if (payloadBytes > HARD_MAX_PAYLOAD_BYTES) {
    return "This graph is too large to draw. Narrow the bundle or filters.";
  }
  return undefined;
}

function clamp(value: number, hard: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return hard;
  }
  return Math.min(hard, Math.floor(value));
}

function byteLength(
  nodes: readonly unknown[],
  edges: readonly unknown[],
): number {
  return new TextEncoder().encode(JSON.stringify({ nodes, edges })).length;
}
