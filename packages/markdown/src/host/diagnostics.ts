import * as vscode from "vscode";
import type {
  DiagnosticEntry,
  DiagnosticItem,
  DiagnosticSink,
} from "../shared/workspace-files";

const severities = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
} as const;

/** One problems-panel collection per plugin owner. */
export function createDiagnostics(): DiagnosticSink {
  const collections = new Map<string, vscode.DiagnosticCollection>();
  return {
    replaceAll(owner, entries) {
      collection(collections, owner).set(entries.map(tuple));
    },
    clear(owner) {
      collections.get(owner)?.clear();
    },
  };
}

function collection(
  collections: Map<string, vscode.DiagnosticCollection>,
  owner: string,
): vscode.DiagnosticCollection {
  const existing = collections.get(owner);
  if (existing) {
    return existing;
  }
  const created = vscode.languages.createDiagnosticCollection(
    `markdownWorkshop.${owner}`,
  );
  collections.set(owner, created);
  return created;
}

function tuple(entry: DiagnosticEntry): [vscode.Uri, vscode.Diagnostic[]] {
  return [vscode.Uri.parse(entry.uri), entry.items.map(diagnostic)];
}

function diagnostic(item: DiagnosticItem): vscode.Diagnostic {
  const range = new vscode.Range(
    item.start.line,
    item.start.col,
    item.end.line,
    item.end.col,
  );
  const problem = new vscode.Diagnostic(
    range,
    item.message,
    severities[item.severity],
  );
  problem.source = "Markdown Workshop";
  return problem;
}
