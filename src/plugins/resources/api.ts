import type { LinkSyntax } from "../../shared/vault-path";
import type { DiffSide } from "../../shared/git";
export interface Resource {
  kind: "note" | "image" | "audio" | "video" | "pdf" | "file";
  source: string;
  url: string;
  text?: string;
}
export interface Resources {
  authorize?(source: string): Promise<void>;
  load(target: string, source?: string, syntax?: LinkSyntax): Promise<Resource>;
}
declare module "../../kernel/types" {
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
declare module "../../kernel/types" {
  interface Services {
    diffResources: DiffResources;
  }
}
