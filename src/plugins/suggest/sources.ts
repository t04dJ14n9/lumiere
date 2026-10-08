import type { VaultIndex, VaultChange, VaultFile } from "../vault/api";
import type { Query, Suggestion } from "./protocol";
import {
  candidate,
  fileCandidates,
  materialize,
  tagCandidates,
  type Candidate,
} from "./candidates";
import { rankedCandidates } from "./rank";
/** Groups rebuild after index changes; unchanged files retain prepared ranking text. */
export class SuggestionIndex {
  private readonly groups = new Map<string, readonly Candidate[]>();
  private readonly files = new Map<string, readonly Candidate[]>();
  constructor(private readonly vault: VaultIndex) {}
  invalidate(change?: VaultChange): void {
    this.groups.clear();
    if (change) {
      this.forget(change.path);
      if (change.type === "rename") {
        this.forget(change.oldPath);
      }
    }
  }
  private forget(path: string): void {
    for (const kind of ["link", "heading", "block"]) {
      this.files.delete(`${kind}:${path}`);
    }
  }
  query(source: string, request: Query): Suggestion[] {
    const entries = this.candidates(source, request);
    const selected =
      request.kind === "tag" && !request.query
        ? entries.slice(0, 50)
        : rankedCandidates(entries, request.query);
    return selected
      .map((entry) =>
        materialize(this.vault, source, entry, request.note === undefined),
      )
      .filter((item) => item.insert.length <= 8192);
  }
  private candidates(source: string, request: Query): readonly Candidate[] {
    const path = this.targetPath(source, request);
    const key = JSON.stringify([request.kind, path]);
    let entries = this.groups.get(key);
    if (!entries) {
      entries = this.collect(request.kind, path).filter(
        (item) => item.label.length <= 8192 && item.detail.length <= 8192,
      );
      this.groups.set(key, entries);
    }
    return entries;
  }
  private targetPath(source: string, request: Query): string | undefined {
    if (
      request.kind === "link" ||
      request.kind === "tag" ||
      request.note === undefined
    ) {
      return undefined;
    }
    if (request.note === "") {
      return source;
    }
    return this.vault.resolveLink(request.note, source)?.path ?? "";
  }
  private collect(kind: Query["kind"], path: string | undefined): Candidate[] {
    if (kind === "tag") {
      return tagCandidates(this.vault);
    }
    const target = path === undefined ? undefined : this.vault.file(path);
    const files =
      path === undefined
        ? this.vault.files()
        : [target].filter((file): file is VaultFile => !!file);
    const result: Candidate[] = [];
    const unresolved = new Set<string>();
    for (const file of files) {
      if (file.excluded) {
        continue;
      }
      result.push(...this.forFile(file, kind));
      if (kind === "link") {
        for (const text of this.vault.unresolvedLinks(file.path).keys()) {
          unresolved.add(text);
        }
      }
    }
    for (const text of unresolved) {
      result.push(
        candidate(text, "Unresolved link", { kind: "literal", text }),
      );
    }
    return result;
  }
  private forFile(
    file: VaultFile,
    kind: "link" | "heading" | "block",
  ): readonly Candidate[] {
    const key = `${kind}:${file.path}`;
    let entries = this.files.get(key);
    if (!entries) {
      entries = fileCandidates(this.vault, file, kind);
      this.files.set(key, entries);
    }
    return entries;
  }
}
export function suggestions(
  vault: VaultIndex,
  source: string,
  request: Query,
): Suggestion[] {
  return new SuggestionIndex(vault).query(source, request);
}
