import type { DiagnosticItem } from "../../shared/workspace-files";

/** Paths from `.wiki/layout.json`, or the legacy fallback when it is absent. */
export interface ResolvedLayout {
  readonly preset: string;
  readonly bundle: string;
  readonly assets: string;
  readonly inbox: string;
  readonly exports: string;
  readonly scratch: string;
  readonly dirs: Readonly<Record<string, string>>;
  readonly source: "layout" | "legacy";
}

export interface WikiProject {
  readonly rootUri: string;
  readonly layout: ResolvedLayout;
  /** Type name to folder declaration from `.wiki/registry.json`, when valid. */
  readonly registryTypes: Readonly<Record<string, string>>;
  readonly problems: readonly {
    uri: string;
    items: readonly DiagnosticItem[];
  }[];
}

export interface WikiPlace {
  readonly project: WikiProject;
  readonly relativePath: string;
  readonly insideBundle: boolean;
  readonly collection?: string;
  readonly reserved: boolean;
}

export interface WikiLayout {
  projects(): readonly WikiProject[];
  projectFor(noteUri: string): WikiProject | undefined;
  place(noteUri: string): WikiPlace | undefined;
  reload(): Promise<void>;
}

declare module "@workshop/core" {
  interface Services {
    wikiLayout: WikiLayout;
  }
}
