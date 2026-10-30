import type { InkRequest, InkService } from "@workshop/ink/service";
import { emptySketch, type InkPoint, type Sketch } from "@workshop/ink/format";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type { SketchHost } from "../../../src/plugins/sketch/edit";
import type { WorkspaceFiles } from "../../../src/shared/workspace-files";

export const ROOT = "file:///vault";

/** A stroke pressed harder in its middle: wider there. */
export function pressedStroke(): Sketch["strokes"][number] {
  const point = (x: number, force: number): InkPoint => ({
    x,
    y: 40,
    t: x / 1000,
    force,
    altitude: 1.2,
    azimuth: 0.5,
    width: 1 + force * 4,
    opacity: 1,
  });
  return {
    tool: "pen",
    color: "#1f2328",
    points: [point(10, 0.1), point(60, 0.9), point(110, 0.1)],
  };
}

export function drawing(strokes = [pressedStroke()]): Sketch {
  return { ...emptySketch(), strokes };
}

/** A canvas that answers each `draw` from `answers` and keeps the requests. */
export function fakeInk(...answers: (Sketch | undefined | Error)[]) {
  const requests: InkRequest[] = [];
  const ink: InkService = {
    capabilities: async () => ({
      engine: "test",
      pressure: true,
      toolPicker: false,
    }),
    draw: async (request) => {
      requests.push(request);
      const answer = answers.shift();
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  };
  return { ink, requests };
}

/** Files by URI, text only, as a vault's folder would hold them. */
export function memoryFiles(
  initial: Record<string, string> = {},
  onWrite: (uri: string) => void = () => {},
) {
  const files = new Map(Object.entries(initial));
  const folders = new Set<string>([ROOT]);
  const api: Pick<WorkspaceFiles, "readText" | "writeText" | "writeBytes" | "list" | "mkdir"> =
    {
      readText: async (uri) => files.get(uri),
      writeText: async (uri, text) => {
        files.set(uri, text);
        onWrite(uri);
      },
      writeBytes: async (uri, data) => {
        files.set(uri, Buffer.from(data).toString("base64"));
        onWrite(uri);
      },
      list: async (uri) => {
        const prefix = `${uri}/`;
        const names = [...files.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => decodeURIComponent(key.slice(prefix.length)))
          .filter((name) => !name.includes("/"));
        return folders.has(uri) || names.length ? names : undefined;
      },
      mkdir: async (uri) => {
        folders.add(uri);
      },
    };
  return { files, folders, api };
}

export function vaultOf(paths: readonly string[]) {
  const index = new MemoryVaultIndex({
    root: ROOT,
    folderNote: "",
    linkFormat: "shortest",
  });
  for (const path of paths) {
    index.upsertFile({ path, uri: uriOf(path), mtime: 0, size: 0 });
  }
  const vault = {
    index,
    settled: async () => {},
    pathOf: (uri: string) =>
      uri.startsWith(`${ROOT}/`)
        ? decodeURIComponent(uri.slice(ROOT.length + 1))
        : undefined,
  };
  return {
    index,
    vaults: {
      locate: async (uri: string) => {
        const path = vault.pathOf(uri);
        return path === undefined ? undefined : { vault, path };
      },
    },
  };
}

export function uriOf(path: string): string {
  return `${ROOT}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function sketchHost(
  overrides: Partial<SketchHost> & Pick<SketchHost, "ink">,
): SketchHost & { readonly errors: string[] } {
  const errors: string[] = [];
  return {
    files: memoryFiles().api,
    vaults: vaultOf([]).vaults,
    error: (message) => errors.push(message),
    ...overrides,
    errors,
  };
}
