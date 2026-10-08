export interface Resource {
  kind: "note" | "image" | "audio" | "video" | "pdf" | "file";
  source: string;
  url: string;
  text?: string;
}
export interface Resources {
  load(target: string, source?: string): Promise<Resource>;
}
declare module "../../kernel/types" {
  interface Services {
    resources: Resources;
  }
}
