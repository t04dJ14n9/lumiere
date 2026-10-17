import { portableAssetLink as portableMarkdownLink } from "./link";
import { insertEdit } from "../../shared/text-edit";
import type { HostDocument, TextEdit } from "../../shared/runtime";
import type { WorkspaceFiles } from "../../shared/workspace-files";
import {
  baseName,
  joinContained,
  walksSymbolicLink,
} from "../../shared/workspace-path";
import { asStrings } from "../../shared/values";
import { planAssetImport } from "./plan";
import type { AssetPlan } from "./plan";

const REPLACE = "Replace";
const KEEP_BOTH = "Keep both";

export interface AssetImport {
  readonly files: WorkspaceFiles;
  readonly sourceUri: string;
  readonly rootUri: string;
  readonly assetsPath: string;
  readonly bundle?: string;
  readonly notePath?: string;
  readonly noteText?: string;
  readonly caret?: number;
  readonly document?: HostDocument;
  ask(message: string, actions: readonly string[]): Promise<string | undefined>;
  apply(document: HostDocument, edits: readonly TextEdit[]): Promise<boolean>;
  clipboardWrite(text: string): Promise<void>;
  inform(message: string): void;
  error(message: string): void;
}

/** Copies one picked file into the assets folder and inserts a Markdown link. */
export async function importAsset(deps: AssetImport): Promise<void> {
  const plan = await chosenPlan(deps);
  if (!plan) {
    return;
  }
  if (await linked(deps, plan.relativePath)) {
    deps.error(
      "The assets path follows a symbolic link. The import was cancelled.",
    );
    return;
  }
  const target = joinContained(deps.rootUri, plan.relativePath);
  if (!target) {
    deps.error("The assets path must stay inside the project.");
    return;
  }
  if (plan.mkdir) {
    await createAssetsDirectory(deps);
  }
  await deps.files.copy(deps.sourceUri, target);
  await placeLink(deps, plan.relativePath);
}

async function chosenPlan(
  deps: AssetImport,
): Promise<Extract<AssetPlan, { kind: "ready" }> | undefined> {
  const names = await assetNames(deps);
  let plan = propose(deps, names);
  if (plan.kind === "refuse") {
    deps.error(plan.reason);
    return undefined;
  }
  if (plan.kind !== "choose") {
    return plan;
  }
  const answer = await deps.ask(
    `${plan.fileName} already exists in ${deps.assetsPath}.`,
    [REPLACE, KEEP_BOTH, "Cancel"],
  );
  if (answer !== REPLACE && answer !== KEEP_BOTH) {
    return undefined;
  }
  plan = propose(deps, names, answer === REPLACE ? "replace" : "keep-both");
  if (plan.kind === "ready") {
    return plan;
  }
  if (plan.kind === "refuse") {
    deps.error(plan.reason);
  }
  return undefined;
}

function propose(
  deps: AssetImport,
  names: {
    readonly existing: readonly string[];
    readonly directoryExists: boolean;
  },
  choice?: "replace" | "keep-both",
) {
  return planAssetImport({
    assetsPath: deps.assetsPath,
    ...(deps.bundle ? { bundle: deps.bundle } : {}),
    originalName: baseName(deps.sourceUri),
    existingNames: names.existing,
    directoryExists: names.directoryExists,
    ...(choice ? { choice } : {}),
  });
}

async function assetNames(deps: AssetImport) {
  const directory = joinContained(deps.rootUri, deps.assetsPath);
  const listed = directory ? await deps.files.list(directory) : undefined;
  return {
    existing: asStrings(listed),
    directoryExists: Array.isArray(listed),
  };
}

async function linked(deps: AssetImport, relative: string): Promise<boolean> {
  return walksSymbolicLink(relative, deps.rootUri, (uri) =>
    deps.files.isSymbolicLink(uri),
  );
}

async function createAssetsDirectory(deps: AssetImport): Promise<void> {
  const directory = joinContained(deps.rootUri, deps.assetsPath);
  if (directory) {
    await deps.files.mkdir(directory);
  }
}

async function placeLink(deps: AssetImport, assetPath: string): Promise<void> {
  const link = deps.notePath
    ? portableMarkdownLink(deps.notePath, assetPath)
    : portableMarkdownLink("index.md", assetPath);
  if (deps.document && typeof deps.noteText === "string") {
    const applied = await deps.apply(deps.document, [
      insertEdit(deps.noteText, deps.caret, link),
    ]);
    if (!applied) {
      deps.error("The file was imported, but the link could not be inserted.");
      return;
    }
    deps.inform("Imported the file and inserted a Markdown link.");
    return;
  }
  await deps.clipboardWrite(link);
  deps.inform("Imported the file. The Markdown link is on the clipboard.");
}
