import { asString } from "../../shared/values";
import type { DiagnosticEntry } from "../../shared/workspace-files";
import type { WikiProject } from "./api";
import { diagnoseNote } from "./diagnose";
import { placeFor } from "./lookup";

export interface OpenNote {
  readonly uri: string;
  readonly text: string;
}

export function collectOpenNotes(input: {
  readonly panels: unknown;
  readonly activeUri: unknown;
  read(uri: string): unknown;
}): OpenNote[] {
  const notes: OpenNote[] = [];
  if (Array.isArray(input.panels)) {
    for (const panel of input.panels) {
      const note = noteFromPanel(panel);
      if (note) {
        notes.push(note);
      }
    }
  }
  const active = asString(input.activeUri);
  if (active && !notes.some((note) => note.uri === active)) {
    const text = input.read(active);
    if (typeof text === "string") {
      notes.push({ uri: active, text });
    }
  }
  return notes;
}

export function diagnoseOpenNotes(
  projects: readonly WikiProject[],
  notes: readonly OpenNote[],
): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = [];
  for (const note of notes) {
    const place = placeFor(projects, note.uri);
    if (!place) {
      continue;
    }
    const items = diagnoseNote(
      place.project.layout,
      place.relativePath,
      note.text,
    );
    if (items.length > 0) {
      entries.push({ uri: note.uri, items });
    }
  }
  return entries;
}

function noteFromPanel(panel: unknown): OpenNote | undefined {
  if (!panel || typeof panel !== "object") {
    return undefined;
  }
  const document = (
    panel as { document?: { uri?: unknown; getText?: unknown } }
  ).document;
  if (
    !document ||
    typeof document.uri !== "string" ||
    typeof document.getText !== "function"
  ) {
    return undefined;
  }
  const text = document.getText();
  if (typeof text !== "string") {
    return undefined;
  }
  return { uri: document.uri, text };
}
