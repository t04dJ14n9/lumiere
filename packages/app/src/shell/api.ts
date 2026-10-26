/**
 * The shell's view of the server (src/server/api.ts): vaults, files,
 * opening, and the event stream. Same origin, so the token cookie goes along.
 */

export interface VaultList {
  readonly open: readonly string[];
  readonly recent: readonly string[];
}

export interface FileEntry {
  readonly path: string;
  readonly kind: "note" | "pdf" | "image" | "other";
}

export interface PaletteCommand {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
}

export type ServerEvent =
  | {
      readonly type: "vaults";
      readonly open: readonly string[];
      readonly added?: string;
    }
  | { readonly type: "open"; readonly vault: string; readonly path: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `${response.status} ${url}`);
  }
  return body;
}

const post = (url: string, body: unknown) =>
  request<unknown>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const api = {
  vaults: () => request<VaultList>("/api/vaults"),
  addVault: (path: string) => post("/api/vaults", { path }),
  closeVault: (path: string) =>
    request<VaultList>("/api/vaults", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    }),
  files: async (vault: string) =>
    (
      await request<{ files: FileEntry[] }>(
        `/api/files?vault=${encodeURIComponent(vault)}`,
      )
    ).files,
  /** A note or folder from outside the shell (a menu, a dropped path). */
  open: (path: string) => post("/api/open", { path }),
  /** Lumière's contributed commands currently available in the Command Palette. */
  commands: async () =>
    (await request<{ commands: PaletteCommand[] }>("/lumiere/commands"))
      .commands,
  runCommand: (command: string) => post("/lumiere/commands", { command }),
  events(listener: (event: ServerEvent) => void): () => void {
    const source = new EventSource("/api/events");
    source.onmessage = (message: MessageEvent<string>) =>
      listener(JSON.parse(message.data) as ServerEvent);
    return () => source.close();
  },
};

/** Whether a path names a Markdown note or PDF that the app can open in a tab. */
export function isNotePath(path: string): boolean {
  return /\.(?:md|markdown|pdf)$/i.test(path);
}

/** The page for a vault file: host-node's editor, or its PDF viewer for a PDF. */
export function editorUrl(vault: string, path: string): string {
  const query = new URLSearchParams({
    path: joinPath(vault, path),
    root: vault,
  });
  const page = /\.pdf$/i.test(path) ? "pdf" : "editor";
  return `/lumiere/${page}?${query.toString()}`;
}

/** A vault path back to vault-relative, or undefined outside the vault. */
export function relativeTo(
  vault: string,
  absolute: string,
): string | undefined {
  const separator = vault.includes("\\") ? "\\" : "/";
  const base = vault.endsWith(separator) ? vault : vault + separator;
  return absolute.startsWith(base)
    ? absolute.slice(base.length).split(separator).join("/")
    : undefined;
}

function joinPath(vault: string, path: string): string {
  const separator = vault.includes("\\") ? "\\" : "/";
  return (
    vault.replace(/[\\/]+$/, "") + separator + path.split("/").join(separator)
  );
}
