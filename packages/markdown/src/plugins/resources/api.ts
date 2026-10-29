import type { LinkSyntax } from "../../shared/vault-path";
import type { DiffSide } from "../../shared/git";
import type { BaseNoteEntry } from "../../markdown/bases";

export type { BaseNoteEntry } from "../../markdown/bases";

export interface Resource {
  kind: "note" | "base" | "image" | "audio" | "video" | "pdf" | "file";
  source: string;
  url: string;
  text?: string;
  entries?: BaseNoteEntry[];
  thisEntry?: BaseNoteEntry;
}
export interface Resources {
  /** Known source-note allowlist (owning doc and nested Markdown notes). */
  authorize?(source: string): Promise<void>;
  /** Vault containment for a target that is not itself a known source note. */
  authorizeTarget?(target: string): Promise<void>;
  load(target: string, source?: string, syntax?: LinkSyntax): Promise<Resource>;
  peek?(
    target: string,
    source?: string,
    syntax?: LinkSyntax,
  ): Resource | undefined;
}
declare module "@workshop/core" {
  interface Services {
    resources: Resources;
  }
  interface Events {
    /**
     * Vault files a note shows were rewritten (a sketch saved, say): what
     * was resolved before points at their old versions. Listeners drop it;
     * the emitter then emits `render/changed` to show the new ones.
     * @mode emit
     */
    "resources/changed": () => void;
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
