interface Point {
  id: string;
  x: number;
  y: number;
}

interface LayoutEdge {
  source: string;
  target: string;
}

interface StartMessage {
  type: "start";
  nodes: Point[];
  edges: LayoutEdge[];
}

const scope = self as unknown as {
  onmessage:
    ((event: MessageEvent<StartMessage | { type: "stop" }>) => void) | null;
  postMessage(message: unknown): void;
};
const MAX_STEPS = 120;
let stopped = false;

scope.onmessage = (event: MessageEvent<StartMessage | { type: "stop" }>) => {
  const message = event.data;
  if (!message || message.type === "stop") {
    stopped = true;
    return;
  }
  stopped = false;
  run(message.nodes, message.edges);
};

function run(nodes: readonly Point[], edges: readonly LayoutEdge[]): void {
  const points = nodes.map((node) => ({ ...node }));
  const index = new Map(points.map((point, at) => [point.id, at]));
  let step = 0;
  const tick = () => {
    if (stopped) {
      return;
    }
    step += 1;
    relax(points, edges, index, 1 - step / MAX_STEPS);
    if (step % 15 === 0 || step === MAX_STEPS) {
      scope.postMessage({ type: "positions", positions: points });
    }
    if (step >= MAX_STEPS) {
      scope.postMessage({ type: "done" });
      return;
    }
    setTimeout(tick, 0);
  };
  tick();
}

function relax(
  points: Point[],
  edges: readonly LayoutEdge[],
  index: Map<string, number>,
  cooling: number,
): void {
  const force = points.map(() => ({ x: 0, y: 0 }));
  repel(points, force);
  attract(points, edges, index, force);
  const scale = 0.05 * Math.max(0, cooling);
  for (let at = 0; at < points.length; at += 1) {
    const point = points[at];
    const push = force[at];
    if (!point || !push) {
      continue;
    }
    point.x += push.x * scale;
    point.y += push.y * scale;
  }
}

function repel(
  points: readonly Point[],
  force: { x: number; y: number }[],
): void {
  for (let at = 0; at < points.length; at += 1) {
    for (let hop = 1; hop <= 12; hop += 1) {
      const other = (at * 17 + hop * 13) % points.length;
      pushApart(points, force, at, other);
    }
  }
}

function pushApart(
  points: readonly Point[],
  force: { x: number; y: number }[],
  left: number,
  right: number,
): void {
  if (left === right) {
    return;
  }
  const a = points[left];
  const b = points[right];
  const fa = force[left];
  const fb = force[right];
  if (!a || !b || !fa || !fb) {
    return;
  }
  const dx = a.x - b.x || 0.01;
  const dy = a.y - b.y || 0.01;
  const distance = Math.hypot(dx, dy) || 0.01;
  const strength = 0.2 / distance;
  fa.x += (dx / distance) * strength;
  fa.y += (dy / distance) * strength;
  fb.x -= (dx / distance) * strength;
  fb.y -= (dy / distance) * strength;
}

function attract(
  points: readonly Point[],
  edges: readonly LayoutEdge[],
  index: Map<string, number>,
  force: { x: number; y: number }[],
): void {
  for (const edge of edges) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (source === undefined || target === undefined) {
      continue;
    }
    const a = points[source];
    const b = points[target];
    const fa = force[source];
    const fb = force[target];
    if (!a || !b || !fa || !fb) {
      continue;
    }
    fa.x += (b.x - a.x) * 0.05;
    fa.y += (b.y - a.y) * 0.05;
    fb.x += (a.x - b.x) * 0.05;
    fb.y += (a.y - b.y) * 0.05;
  }
}
