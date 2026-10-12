import type { Context } from "../../kernel";
import { asStrings } from "../../shared/values";
import type { DiagnosticEntry } from "../../shared/workspace-files";
import type { WorkspaceFiles } from "../../shared/workspace-files";
import type { WikiLayout, WikiProject } from "./api";
import { loadWikiRoot } from "./load";
import { placeFor } from "./lookup";
import { collectOpenNotes, diagnoseOpenNotes } from "./notes";

export interface WikiSession {
  projects: WikiProject[];
  problems: DiagnosticEntry[];
  generation: number;
}

export function layoutService(
  state: WikiSession,
  reload: () => Promise<void>,
): WikiLayout {
  return {
    projects: () => state.projects,
    projectFor: (uri) => placeFor(state.projects, uri)?.project,
    place: (uri) => placeFor(state.projects, uri),
    reload,
  };
}

/** Reads every workspace folder. A thrown read is the caller's to report. */
export async function reloadWiki(
  ctx: Context,
  state: WikiSession,
): Promise<void> {
  const stamp = ++state.generation;
  const files = ctx.workbench.files;
  if (!files || typeof files.readText !== "function") {
    return;
  }
  const loaded = await loadProjects(
    asStrings(ctx.workbench.workspaceFolders?.()),
    files,
  );
  if (!stillCurrent(ctx, state, stamp)) {
    return;
  }
  const notes = collectOpenNotes({
    panels: ctx.editors?.all(),
    activeUri: ctx.workbench.views?.activeNote(),
    read: (uri) => ctx.workbench.views?.documentText(uri),
  });
  const problems = mergeDiagnostics([
    ...loaded.problems,
    ...diagnoseOpenNotes(loaded.projects, notes),
  ]);
  if (!stillCurrent(ctx, state, stamp)) {
    return;
  }
  state.projects = loaded.projects;
  state.problems = problems;
  ctx.workbench.diagnostics?.replaceAll("wiki", problems);
}

export function mergeDiagnostics(
  entries: readonly DiagnosticEntry[],
): DiagnosticEntry[] {
  const byUri = new Map<string, DiagnosticEntry["items"][number][]>();
  for (const entry of entries) {
    const items = byUri.get(entry.uri) ?? [];
    items.push(...entry.items);
    byUri.set(entry.uri, items);
  }
  return [...byUri].map(([uri, items]) => ({ uri, items }));
}

async function loadProjects(
  roots: readonly string[],
  files: WorkspaceFiles,
): Promise<{ projects: WikiProject[]; problems: DiagnosticEntry[] }> {
  const projects: WikiProject[] = [];
  const problems: DiagnosticEntry[] = [];
  for (const root of roots) {
    const loaded = await loadWikiRoot(root, files);
    if (loaded.project) {
      projects.push(loaded.project);
    }
    problems.push(...loaded.diagnostics);
  }
  return { projects, problems };
}

function stillCurrent(
  ctx: Context,
  state: WikiSession,
  stamp: number,
): boolean {
  return ctx.isLive && state.generation === stamp;
}
