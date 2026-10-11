import {
  span,
  type DiagnosticEntry,
  type DiagnosticItem,
} from "../../shared/workspace-files";
import type { WorkspaceFiles } from "../../shared/workspace-files";
import { joinContained } from "../../shared/workspace-path";
import type { ResolvedLayout, WikiProject } from "./api";
import {
  legacyLayout,
  parseLayout,
  parseManifestBundle,
  parseRegistry,
} from "./layout";

export interface LoadedWiki {
  readonly project?: WikiProject;
  readonly diagnostics: readonly DiagnosticEntry[];
}

/** Read one project. A missing layout is legacy; a broken layout is not guessed. */
export async function loadWikiRoot(
  rootUri: string,
  files: WorkspaceFiles,
): Promise<LoadedWiki> {
  const layoutUri = joinContained(rootUri, ".wiki/layout.json");
  const manifestUri = joinContained(rootUri, ".wiki/manifest.json");
  const registryUri = joinContained(rootUri, ".wiki/registry.json");
  const layoutText = await readText(files, layoutUri);
  if (layoutText === undefined) {
    return loadLegacy(rootUri, files, manifestUri, registryUri);
  }
  const parsed = parseLayout(layoutText);
  if (!parsed.ok || !parsed.layout || !layoutUri) {
    return {
      diagnostics: layoutUri
        ? [
            entry(
              layoutUri,
              layoutText,
              parsed.message ?? "Could not read layout.json",
              "error",
            ),
          ]
        : [],
    };
  }
  const registry = await readRegistry(files, registryUri, parsed.layout);
  return {
    project: project(
      rootUri,
      parsed.layout,
      registry.types,
      registry.diagnostics,
    ),
    diagnostics: registry.diagnostics,
  };
}

async function loadLegacy(
  rootUri: string,
  files: WorkspaceFiles,
  manifestUri: string | undefined,
  registryUri: string | undefined,
): Promise<LoadedWiki> {
  const manifestText = await readText(files, manifestUri);
  if (manifestText !== undefined) {
    const manifest = parseManifestBundle(manifestText);
    if (!manifest.ok || !manifest.layout) {
      return {
        diagnostics: manifestUri
          ? [
              entry(
                manifestUri,
                manifestText,
                manifest.message ?? "Could not read manifest.json",
                "error",
              ),
            ]
          : [],
      };
    }
    const registry = await readRegistry(files, registryUri, manifest.layout);
    return {
      project: project(
        rootUri,
        manifest.layout,
        registry.types,
        registry.diagnostics,
      ),
      diagnostics: registry.diagnostics,
    };
  }
  const layout = legacyLayout();
  const registry = await readRegistry(files, registryUri, layout);
  return {
    project: project(rootUri, layout, registry.types, registry.diagnostics),
    diagnostics: registry.diagnostics,
  };
}

async function readRegistry(
  files: WorkspaceFiles,
  uri: string | undefined,
  layout: ResolvedLayout,
): Promise<{ types: Record<string, string>; diagnostics: DiagnosticEntry[] }> {
  const text = await readText(files, uri);
  if (text === undefined || !uri) {
    return { types: {}, diagnostics: [] };
  }
  const parsed = parseRegistry(text);
  if (!parsed.ok) {
    return {
      types: {},
      diagnostics: [
        entry(
          uri,
          text,
          parsed.message ?? "Could not read registry.json",
          "warning",
        ),
      ],
    };
  }
  const diagnostics: DiagnosticEntry[] = [];
  if (parsed.bundle && parsed.bundle !== layout.bundle) {
    diagnostics.push(
      entry(
        uri,
        text,
        "registry.json bundle does not match layout.json. Layout paths are used.",
        "warning",
      ),
    );
  }
  return { types: { ...parsed.types }, diagnostics };
}

function project(
  rootUri: string,
  layout: ResolvedLayout,
  registryTypes: Record<string, string>,
  diagnostics: readonly DiagnosticEntry[],
): WikiProject {
  return { rootUri, layout, registryTypes, problems: diagnostics };
}

async function readText(
  files: WorkspaceFiles,
  uri: string | undefined,
): Promise<string | undefined> {
  if (!uri) {
    return undefined;
  }
  const text = await files.readText(uri);
  return typeof text === "string" ? text : undefined;
}

function entry(
  uri: string,
  text: string,
  message: string,
  severity: DiagnosticItem["severity"],
): DiagnosticEntry {
  return { uri, items: [{ message, severity, ...span(text, 0, 0) }] };
}
