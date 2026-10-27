/**
 * The real Markdown host on an in-memory vault shaped like a code repository
 * with notes in it, with one note open through a webview endpoint the test
 * drives. Shared by the large-vault quality checks.
 */
import { performance } from "node:perf_hooks";
import { bootstrap } from "../../src/host/bootstrap";
import { protocol as editorProtocol } from "../../src/plugins/editor/protocol";
import type { PanelShell } from "../../src/shared/host";
import { Endpoint } from "../../src/shared/rpc/endpoint";
import { fakeDocument, fakeHost } from "../support/vscode-fake";
import { fakeViews } from "../unit/views/fakes";
import { MemoryFileSystem, memorySystem, wait } from "../unit/vault/memory-fs";

const ROOT = "memory:///vault";

/** `notes` linked, tagged notes, and `files - notes` small code files. */
export function vaultFiles(files: number, notes: number) {
  const out: Record<string, string> = {};
  for (let index = 0; index < notes; index++) {
    out[`notes/Note ${index}.md`] = [
      "---",
      `tags: [topic${index % 40}]`,
      "---",
      `# Note ${index}`,
      "",
      `See [[Note ${(index + 1) % notes}]] and [[Note ${(index + 7) % notes}]]. #t${index % 25}`,
      "",
      "Body text. ".repeat(30),
      "",
    ].join("\n");
  }
  for (let index = notes; index < files; index++) {
    out[
      `src/pkg${Math.floor(index / 600)}/mod${Math.floor(index / 6)}/file${index}.go`
    ] = `package mod${Math.floor(index / 6)}\n`;
  }
  return out;
}

export interface OpenVault {
  fs: MemoryFileSystem;
  /** Bytes the host has sent to the open note so far. */
  sent(): number;
  /** Ask the host for the note's text, as the webview does when it starts. */
  ready(): Promise<number>;
  /** Change `count` notes on disk, as a pull or a build would. */
  changeNotes(count: number): void;
  settle(): Promise<void>;
  dispose(): Promise<void>;
}

/** Start the host on the vault and open its first note. */
export async function openVault(
  files: Record<string, string>,
): Promise<OpenVault> {
  const fs = new MemoryFileSystem({ ".obsidian/app.json": "{}", ...files });
  let open: (panel: PanelShell) => void = () => {};
  const host = fakeHost({
    settings: { forNote: () => ({ preset: "obsidian", mode: "livePreview" }) },
    customEditors: {
      register: (_provider, callback) => {
        open = callback;
        return () => {};
      },
    },
  });
  host.views = fakeViews().views;
  host.storage = { get: (_key, fallback) => fallback, update: async () => {} };
  const root = await bootstrap(
    host,
    memorySystem(fs, [`${ROOT}/.obsidian`]).value,
  );

  let bytes = 0;
  let toHost: (message: unknown) => void = () => {};
  let toView: (message: unknown) => void = () => {};
  const clock = {
    after(ms: number, callback: () => void) {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  };
  const view = new Endpoint(
    {
      send: (message) => queueMicrotask(() => toHost(structuredClone(message))),
      listen: (receive) => {
        toView = receive;
        return () => {};
      },
    },
    clock,
  );
  open({
    id: "panel",
    column: undefined,
    document: fakeDocument({ uri: `${ROOT}/notes/Note 0.md` }),
    cspSource: "test",
    trusted: true,
    transport: {
      send: (message) => {
        bytes += JSON.stringify(message).length;
        queueMicrotask(() => toView(structuredClone(message)));
      },
      listen: (receive) => {
        toHost = receive;
        return () => {};
      },
    },
    active: () => true,
    reveal() {},
    dispose() {},
    setHTML() {},
    asset: (path) => path,
    resource: (uri) => uri,
    onDispose: () => () => {},
    onState: () => () => {},
  });
  let edit = 0;
  return {
    fs,
    sent: () => bytes,
    async ready() {
      const started = performance.now();
      await view.call(editorProtocol, "ready", {});
      return performance.now() - started;
    },
    changeNotes(count) {
      edit += 1;
      for (let index = 0; index < count; index++) {
        fs.change(
          `notes/Note ${index}.md`,
          `# Note ${index}\n\nEdit ${edit}.\n`,
        );
      }
    },
    async settle() {
      await root.settled();
      await wait(50);
    },
    dispose: () => root.dispose(),
  };
}
