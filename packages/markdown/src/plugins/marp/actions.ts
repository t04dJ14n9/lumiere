import { isMarpDocument, setMarpEnabled } from "../../markdown/marp";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import { portableMarkdownLink } from "../../shared/markdown-link";
import { replaceAllEdit } from "../../shared/text-edit";
import type { HostDocument, TextEdit } from "../../shared/host";
import { uniqueFileName } from "../../shared/file-name";
import { asStrings } from "../../shared/values";
import type { WorkspaceFiles } from "../../shared/workspace-files";
import {
  baseName,
  isInsidePath,
  joinContained,
  walksSymbolicLink,
} from "../../shared/workspace-path";
import { isKept, rememberDeck } from "./keep";
import type { KeepStorage } from "./keep";
import { outsideDeckPath, shouldOpenMarpAsText } from "./redirect";

export const MARP_EXTENSION = "marp-team.marp-vscode";

export interface MarpActions {
  readonly files?: WorkspaceFiles;
  readonly storage?: KeepStorage;
  execute(id: string, ...args: unknown[]): Promise<unknown>;
  reveal?(uri: string): Promise<void>;
  apply(document: HostDocument, edits: readonly TextEdit[]): Promise<boolean>;
  ask(message: string, actions: readonly string[]): Promise<string | undefined>;
  clipboardWrite(text: string): Promise<void>;
  inform(message: string): void;
  error(message: string): void;
  trusted(): boolean | undefined;
  marpInstalled(): boolean;
}

export async function previewDeck(
  actions: MarpActions,
  uri: string,
): Promise<void> {
  await actions.execute("markdown.showPreviewToSide", uri);
  if (!actions.marpInstalled()) {
    actions.inform(
      "Opened the Markdown preview. Install Marp for VS Code to render slides.",
    );
  }
}

export async function exportDeck(
  actions: MarpActions,
  uri: string,
): Promise<void> {
  if (actions.trusted() === false) {
    actions.error("Marp export needs a trusted workspace.");
    return;
  }
  if (!actions.marpInstalled()) {
    await offerMarpInstall(actions);
    return;
  }
  if (!actions.reveal) {
    actions.error("Cannot show the text editor for export.");
    return;
  }
  await actions.reveal(uri);
  await actions.execute("markdown.marp.export");
}

export async function toggleMarp(
  actions: MarpActions,
  document: HostDocument,
): Promise<void> {
  const source = document.getText();
  const next = setMarpEnabled(source, !isMarpDocument(source));
  if (next === source) {
    actions.inform(
      isMarpDocument(source) ? "Marp is already on." : "Marp is already off.",
    );
    return;
  }
  const applied = await actions.apply(document, [replaceAllEdit(source, next)]);
  if (!applied) {
    actions.error("Could not update the Marp frontmatter.");
  }
}

export async function keepDeck(
  actions: MarpActions,
  uri: string,
): Promise<void> {
  await rememberDeck(actions.storage, uri);
  await actions.execute("vscode.openWith", uri, MARKDOWN_EDITOR.viewType);
  actions.inform("This deck stays in Markdown Workshop.");
}

export function redirectToTextEditor(input: {
  readonly mode: unknown;
  readonly text: string;
  readonly uri: string;
  readonly storage?: KeepStorage;
}): boolean {
  return shouldOpenMarpAsText({
    mode: typeof input.mode === "string" ? input.mode : "workbench",
    isMarp: isMarpDocument(input.text),
    allowed: isKept(input.storage, input.uri),
  });
}

/**
 * A deck inside the bundle is moved out unchanged. Frontmatter is not added,
 * so a deck is never wrapped into a wiki page.
 */
export async function moveDeckOutside(
  actions: MarpActions,
  input: {
    readonly rootUri: string;
    readonly relativePath: string;
    readonly bundle?: string;
    readonly exportsPath: string;
    readonly text: string;
    readonly sourceUri: string;
    readonly dirty: boolean;
  },
): Promise<void> {
  if (!isMarpDocument(input.text)) {
    actions.error("This note is not a Marp deck.");
    return;
  }
  if (!input.bundle || !isInsidePath(input.bundle, input.relativePath)) {
    actions.inform("This deck is already outside the wiki bundle.");
    return;
  }
  if (input.dirty) {
    actions.error("Save the deck before moving it outside the bundle.");
    return;
  }
  if (!actions.files) {
    actions.error("Workspace files are unavailable.");
    return;
  }
  const relative = await destination(actions.files, input);
  if (!relative) {
    actions.error("The exports path must stay inside the project.");
    return;
  }
  if (await linked(actions.files, input.rootUri, relative)) {
    actions.error(
      "The exports path follows a symbolic link. The deck was not moved.",
    );
    return;
  }
  const wrote = await writeOutside(actions.files, input, relative);
  if (!wrote) {
    actions.error("The exports path must stay inside the project.");
    return;
  }
  await actions.clipboardWrite(
    portableMarkdownLink(`${input.bundle}/index.md`, relative),
  );
  actions.inform(outsideMessage(wrote));
}

async function offerMarpInstall(actions: MarpActions): Promise<void> {
  const answer = await actions.ask("Export needs Marp for VS Code.", [
    "Install Marp for VS Code",
    "Cancel",
  ]);
  if (answer === "Install Marp for VS Code") {
    await actions.execute("workbench.extensions.search", MARP_EXTENSION);
  }
}

async function linked(
  files: WorkspaceFiles,
  rootUri: string,
  relative: string,
): Promise<boolean> {
  return walksSymbolicLink(relative, rootUri, (uri) =>
    files.isSymbolicLink(uri),
  );
}

async function destination(
  files: WorkspaceFiles,
  input: {
    readonly rootUri: string;
    readonly exportsPath: string;
    readonly relativePath: string;
  },
): Promise<string | undefined> {
  const directory = joinContained(input.rootUri, input.exportsPath);
  const listed = directory ? await files.list(directory) : undefined;
  const name = uniqueFileName(baseName(input.relativePath), asStrings(listed));
  const relative = outsideDeckPath(input.exportsPath, name);
  return safeMove(input.rootUri, relative) ? relative : undefined;
}

function safeMove(rootUri: string, relative: string): boolean {
  return Boolean(joinContained(rootUri, relative));
}

async function writeOutside(
  files: WorkspaceFiles,
  input: {
    readonly rootUri: string;
    readonly exportsPath: string;
    readonly sourceUri: string;
  },
  relative: string,
): Promise<"moved" | "copied" | undefined> {
  const target = joinContained(input.rootUri, relative);
  const directory = joinContained(input.rootUri, input.exportsPath);
  if (!target || !directory) {
    return undefined;
  }
  const listed = await files.list(directory);
  if (!Array.isArray(listed)) {
    await files.mkdir(directory);
  }
  try {
    await files.move(input.sourceUri, target);
    return "moved";
  } catch {
    await files.copy(input.sourceUri, target);
    return "copied";
  }
}

function outsideMessage(wrote: "moved" | "copied"): string {
  if (wrote === "copied") {
    return "Copied the deck outside the bundle and copied a Markdown link. The open note was left in place and was not wrapped.";
  }
  return "Moved the deck outside the bundle and copied a Markdown link. It was not wrapped as a wiki page.";
}

export function marpFlag(text: string): boolean {
  return typeof text === "string" && isMarpDocument(text);
}
