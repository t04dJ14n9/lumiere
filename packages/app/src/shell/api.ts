/**
 * The window's view of a Lumière server (src/server/api.ts): vaults, files,
 * opening, trust and the event stream (`httpApi`, part of http-backend.ts).
 * Same origin, so the token cookie goes along.
 */

export interface VaultList {
  readonly open: readonly string[];
  readonly recent: readonly string[];
}

export interface FileEntry {
  readonly path: string;
  readonly kind: "note" | "pdf" | "image" | "other";
}

/** A vault waiting for the owner to say whether its plugins may run. */
export interface TrustQuestion {
  readonly vault: string;
  readonly plugins: readonly string[];
}

export type ServerEvent =
  | {
      readonly type: "vaults";
      readonly open: readonly string[];
      readonly added?: string;
    }
  | { readonly type: "open"; readonly vault: string; readonly path: string }
  /** The questions waiting changed; read them with `trustQuestions`. */
  | { readonly type: "trust" };

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

export const httpApi = {
  vaults: {
    list: () => request<VaultList>("/api/vaults"),
    add: (path: string) => post("/api/vaults", { path }),
    files: async (vault: string) =>
      (
        await request<{ files: FileEntry[] }>(
          `/api/files?vault=${encodeURIComponent(vault)}`,
        )
      ).files,
    open: (path: string) => post("/api/open", { path }),
  },
  trust: {
    questions: () => request<TrustQuestion[]>("/api/trust"),
    decide: (vault: string, allowed: boolean) =>
      post("/api/trust", { vault, allowed }),
  },
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
