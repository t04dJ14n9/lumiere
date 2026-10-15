// src/shared/git-blame/types.ts
export interface GitBlameSnapshot {
  readonly contents: string;
  readonly version: number | string;
}

export interface GitBlameOk {
  readonly commit: string;
  readonly shortCommit: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorDate: number;
  readonly subject: string;
  readonly line: number;
  readonly boundary?: boolean;
}

export type GitBlameLineResult =
  | {
      readonly status: "ok";
      readonly blame: GitBlameOk;
      readonly repoGeneration: number;
    }
  | { readonly status: "uncommitted"; readonly repoGeneration: number }
  | { readonly status: "untracked"; readonly repoGeneration: number }
  | { readonly status: "unavailable"; readonly repoGeneration: number }
  | { readonly status: "empty"; readonly repoGeneration: number }
  | { readonly status: "stale"; readonly repoGeneration: number };

export interface GitIdentity {
  readonly userName?: string;
  readonly userEmail?: string;
}
