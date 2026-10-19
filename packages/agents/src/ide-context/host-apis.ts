import type { IdeContextHostApis } from "./gather";
import type { DiagnosticItem } from "./types";

export const KNOWN_WORKSHOP_VIEW_TYPES = [
  "lumiere.markdown.editor",
  "lumiere.pdf.viewer",
] as const;

interface UriLike {
  toString(): string;
}
interface PositionLike {
  line: number;
  character: number;
}
interface TabGroupLike {
  isActive: boolean;
  tabs: readonly { input: unknown; isActive: boolean }[];
}
interface DiagnosticLike {
  severity: number;
  message: string;
  range: { start: PositionLike; end: PositionLike };
  source?: string;
  code?: string | number | { value: string | number };
}

/** Only host API structure is required; no VS Code runtime is loaded here. */
export interface VsCodeIdeContextFacade<Uri> {
  window: {
    tabGroups: { all: readonly TabGroupLike[] };
    activeTextEditor?:
      | {
          document: { uri: UriLike; languageId: string; isDirty: boolean };
          selection: { active: PositionLike };
        }
      | undefined;
  };
  Uri: { parse(value: string): Uri };
  languages: { getDiagnostics(uri: Uri): readonly DiagnosticLike[] };
  workspace?: {
    name?: string | undefined;
    workspaceFolders?: readonly unknown[] | undefined;
  };
}

function tabUri(
  input: unknown,
  allowed: ReadonlySet<string>,
): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const candidate = input as { uri?: UriLike; viewType?: string };
  if (candidate.viewType !== undefined && !allowed.has(candidate.viewType)) {
    return undefined;
  }
  const uri = candidate.uri?.toString();
  if (uri && /^(?:output|vscode-output|vscode-terminal):/i.test(uri)) {
    return undefined;
  }
  return uri;
}

export function enumerateTabUris(
  groups: readonly TabGroupLike[],
  customViewTypes: readonly string[] = [],
): { visible: string[]; open: string[] } {
  const allowed = new Set<string>([
    ...KNOWN_WORKSHOP_VIEW_TYPES,
    ...customViewTypes,
  ]);
  const open = new Set<string>();
  const visible = new Set<string>();
  for (const group of groups) {
    for (const tab of group.tabs) {
      const uri = tabUri(tab.input, allowed);
      if (uri) {
        open.add(uri);
      }
    }
  }
  // Each editor group displays its active tab, even when another group has focus.
  const ordered = [
    ...groups.filter((g) => g.isActive),
    ...groups.filter((g) => !g.isActive),
  ];
  for (const group of ordered) {
    for (const tab of group.tabs) {
      const uri = tab.isActive ? tabUri(tab.input, allowed) : undefined;
      if (uri) {
        visible.add(uri);
      }
    }
  }
  return { visible: [...visible], open: [...open] };
}

export function mapVsCodeDiagnostic(
  diagnostic: DiagnosticLike,
): DiagnosticItem {
  const severities = ["error", "warning", "information", "hint"] as const;
  return {
    severity: severities[diagnostic.severity] ?? "information",
    message: diagnostic.message,
    startLine: diagnostic.range.start.line,
    startCharacter: diagnostic.range.start.character,
    endLine: diagnostic.range.end.line,
    endCharacter: diagnostic.range.end.character,
    ...(diagnostic.source !== undefined ? { source: diagnostic.source } : {}),
    ...(diagnostic.code !== undefined
      ? { code: diagnosticCode(diagnostic.code) }
      : {}),
  };
}

export function createVsCodeIdeContextHost<Uri>(
  vscodeLike: VsCodeIdeContextFacade<Uri>,
  options: { customViewTypes?: readonly string[] } = {},
): IdeContextHostApis {
  const editor = vscodeLike.window.activeTextEditor;
  const workspace = vscodeLike.workspace;
  const host: IdeContextHostApis = {
    listTabs() {
      try {
        return enumerateTabUris(
          vscodeLike.window.tabGroups.all,
          options.customViewTypes,
        );
      } catch {
        return { visible: [], open: [] };
      }
    },
    getDiagnostics(uri) {
      try {
        return vscodeLike.languages
          .getDiagnostics(vscodeLike.Uri.parse(uri))
          .map(mapVsCodeDiagnostic);
      } catch {
        return [];
      }
    },
  };
  if (editor) {
    host.activeTextEditor = {
      uri: editor.document.uri.toString(),
      languageId: editor.document.languageId,
      isDirty: editor.document.isDirty,
      caret: {
        line: editor.selection.active.line,
        character: editor.selection.active.character,
      },
    };
  }
  if (workspace) {
    host.workspace = { folderCount: workspace.workspaceFolders?.length ?? 0 };
    if (workspace.name !== undefined) {
      host.workspace.name = workspace.name;
    }
  }
  return host;
}

function diagnosticCode(
  code: NonNullable<DiagnosticLike["code"]>,
): string | number {
  return typeof code === "object" ? code.value : code;
}
