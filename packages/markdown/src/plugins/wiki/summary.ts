import type { DiagnosticEntry } from "../../shared/workspace-files";
import type { WikiProject } from "./api";

export function layoutSummary(
  project: WikiProject | undefined,
  problems: readonly DiagnosticEntry[],
  root: string | undefined,
): string {
  if (!root) {
    return "Open a note in a workspace folder to see its wiki layout.";
  }
  if (!project) {
    return brokenLayout(problems, root);
  }
  const dirs = Object.entries(project.layout.dirs)
    .map(([logical, physical]) => `$${logical} → ${physical}`)
    .join(", ");
  const collections = dirs
    ? `Collections: ${dirs}.`
    : "No collection directories are declared.";
  return [
    `Preset ${project.layout.preset} (${project.layout.source}).`,
    `Bundle ${project.layout.bundle}.`,
    `Assets ${project.layout.assets}, scratch ${project.layout.scratch}, exports ${project.layout.exports}.`,
    collections,
    "No agent was started.",
  ].join(" ");
}

function brokenLayout(
  problems: readonly DiagnosticEntry[],
  root: string,
): string {
  const prefix = root.replace(/\/$/, "");
  const broken = problems.some(
    (entry) =>
      entry.uri.startsWith(prefix) &&
      entry.items.some((item) => item.severity === "error"),
  );
  if (broken) {
    return "This folder's .wiki/layout.json could not be read. It was not treated as the legacy preset.";
  }
  return "No wiki project for this folder.";
}
