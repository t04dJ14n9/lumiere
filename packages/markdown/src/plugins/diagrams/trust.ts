/** Obsidian vault key `mermaid-vault-trust` — Allow persists across reloads. */
export const MERMAID_TRUST_KEY = "lumiere.mermaid-vault-trust";

export interface MermaidTrust {
  isTrusted(): boolean;
  allow(): void;
}

/** Webview localStorage mirror of Obsidian's loadLocalStorage/saveLocalStorage. */
export function createMermaidTrust(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = defaultStorage(),
): MermaidTrust {
  let memory = false;
  return {
    isTrusted() {
      if (memory) {
        return true;
      }
      try {
        return storage?.getItem(MERMAID_TRUST_KEY) === "1";
      } catch {
        return false;
      }
    },
    allow() {
      memory = true;
      try {
        storage?.setItem(MERMAID_TRUST_KEY, "1");
      } catch {
        /* private mode / missing storage */
      }
    },
  };
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
