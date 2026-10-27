/**
 * Sum a V8 CPU profile's self time by source module. The harness bundle is
 * not minified, so esbuild's `// path` comment before each module names the
 * lines that follow it.
 */
import { readFileSync } from "node:fs";

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}

export interface CpuProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

export interface ProfileSummary {
  totalMs: number;
  modules: { name: string; ms: number }[];
  functions: { name: string; ms: number }[];
}

let moduleStarts: { line: number; name: string }[] | undefined;

function modulesOf(bundle: string): { line: number; name: string }[] {
  if (!moduleStarts) {
    moduleStarts = [];
    const lines = readFileSync(bundle, "utf8").split("\n");
    lines.forEach((text, line) => {
      const match =
        /^ {0,4}\/\/ ((?:\.\.\/)*[\w@.-]+\/\S+\.(?:ts|js|mjs|cjs))$/.exec(text);
      if (match) {
        moduleStarts!.push({
          line,
          name: match[1]!.replace(
            /^.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?/,
            "npm:",
          ),
        });
      }
    });
  }
  return moduleStarts;
}

function moduleAt(starts: { line: number; name: string }[], line: number) {
  let low = 0;
  let high = starts.length - 1;
  let found = "(bundle)";
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle]!.line <= line) {
      found = starts[middle]!.name;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Group npm packages to their package name; keep our own files whole. */
function bucket(name: string): string {
  if (!name.startsWith("npm:")) {
    return name;
  }
  const parts = name.slice(4).split("/");
  return `npm:${parts[0]!.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]}`;
}

export function summarise(profile: CpuProfile, bundle: string): ProfileSummary {
  const starts = modulesOf(bundle);
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map<number, number>();
  profile.samples.forEach((id, index) => {
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0));
  });
  const modules = new Map<string, number>();
  const functions = new Map<string, number>();
  let total = 0;
  for (const [id, micros] of self) {
    const frame = byId.get(id)!.callFrame;
    const ms = micros / 1000;
    let module: string;
    if (frame.url.endsWith("fake-host.js")) {
      module = bucket(moduleAt(starts, frame.lineNumber));
    } else if (frame.url) {
      module = frame.url.split("/").pop()!;
    } else {
      module = frame.functionName || "(native)";
    }
    if (frame.functionName === "(idle)") {
      continue;
    }
    total += ms;
    modules.set(module, (modules.get(module) ?? 0) + ms);
    const name = `${frame.functionName || "(anonymous)"} ${module}:${frame.lineNumber}`;
    functions.set(name, (functions.get(name) ?? 0) + ms);
  }
  const top = (map: Map<string, number>, count: number) =>
    [...map]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([name, ms]) => ({ name, ms: Math.round(ms) }));
  return {
    totalMs: Math.round(total),
    modules: top(modules, 25),
    functions: top(functions, 30),
  };
}
