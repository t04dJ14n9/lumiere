import type { LinkSyntax } from "../../shared/vault-path";
import type { DiffSide } from "../../shared/git";
export interface Resource {
  kind: "note" | "image" | "audio" | "video" | "pdf" | "file";
  source: string;
  url: string;
  text?: string;
}
export interface Resources {
  /** Known source-note allowlist (owning doc and nested Markdown notes). */
  authorize?(source: string): Promise<void>;
  /** Vault containment for a target that is not itself a known source note. */
  authorizeTarget?(target: string): Promise<void>;
  load(target: string, source?: string, syntax?: LinkSyntax): Promise<Resource>;
}
declare module "@workshop/core" {
  interface Services {
    resources: Resources;
  }
}

export interface DiffResources {
  forSide(side: DiffSide): Promise<{
    root: string;
    load(target: string): Promise<string>;
  }>;
}
declare module "@workshop/core" {
  interface Services {
    diffResources: DiffResources;
  }
}
