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
  files: async (vault: string) =>
    (
      await request<{ files: FileEntry[] }>(
        `/api/files?vault=${encodeURIComponent(vault)}`,
      )
    ).files,
  /** A note or folder from outside the shell (a menu, a dropped path). */
  open: (path: string) => post("/api/open", { path }),
  events(listener: (event: ServerEvent) => void): () => void {
    const source = new EventSource("/api/events");
    source.onmessage = (message: MessageEvent<string>) =>
      listener(JSON.parse(message.data) as ServerEvent);
    return () => source.close();
  },
};

/** The editor page for a vault file (host-node's `/lumiere/editor`). */
export function editorUrl(vault: string, path: string): string {
  const query = new URLSearchParams({
    path: joinPath(vault, path),
    root: vault,
  });
  return `/lumiere/editor?${query.toString()}`;
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
