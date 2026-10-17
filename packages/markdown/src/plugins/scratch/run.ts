import { portableMarkdownLink } from "../../shared/markdown-link";
import { replaceAllEdit } from "../../shared/text-edit";
import type { HostDocument, TextEdit } from "../../shared/runtime";
import { asStrings } from "../../shared/values";
import type { WorkspaceFiles } from "../../shared/workspace-files";
import {
  joinContained,
  safeRelative,
  walksSymbolicLink,
} from "../../shared/workspace-path";
import type { ResolvedLayout } from "../wiki/api";
import { promotedFileName, scratchFileName } from "./names";
import {
  destinationDirectory,
  promotePage,
  promoteRefusal,
  promotedStub,
  scratchBody,
  scratchIsInsideBundle,
  scratchNote,
} from "./template";
import type { PromoteTarget } from "./template";

export interface ScratchIO {
  readonly files: WorkspaceFiles;
  readonly rootUri: string;
  readonly layout?: ResolvedLayout;
  execute(id: string, ...args: unknown[]): Promise<unknown>;
  apply(document: HostDocument, edits: readonly TextEdit[]): Promise<boolean>;
  inform(message: string): void;
  error(message: string): void;
}

export async function createScratchNote(
  io: ScratchIO,
  input: {
    readonly title: string;
    readonly at: string;
    readonly folder: string;
  },
): Promise<void> {
  const folder = safeRelative(input.folder);
  if (!folder) {
    io.error("The scratch folder must stay inside the project.");
    return;
  }
  if (scratchIsInsideBundle(io.layout, folder)) {
    io.error(
      "Scratch notes stay outside the wiki bundle. Change the scratch folder in .wiki/layout.json.",
    );
    return;
  }
  if (await blocked(io, folder)) {
    return;
  }
  const names = await directoryNames(io, folder);
  const relative = `${folder}/${scratchFileName(input.title, input.at, names)}`;
  if (await blocked(io, relative)) {
    return;
  }
  await ensureDirectory(io, folder);
  const uri = joinContained(io.rootUri, relative);
  if (!uri) {
    io.error("The scratch folder must stay inside the project.");
    return;
  }
  await io.files.writeText(uri, scratchNote(input.title, input.at));
  await io.execute("vscode.open", uri);
  io.inform(
    "Created a scratch note outside the wiki. It stays out until you promote it. No agent was started.",
  );
}

export async function promoteScratchNote(
  io: ScratchIO,
  input: {
    readonly target: PromoteTarget;
    readonly title: string;
    readonly text: string;
    readonly at: string;
    readonly scratchRelative: string;
    readonly document?: HostDocument;
  },
): Promise<void> {
  const refusal = promoteRefusal(input.text);
  if (refusal) {
    io.error(refusal);
    return;
  }
  if (scratchIsInsideBundle(io.layout, directoryOf(input.scratchRelative))) {
    io.error("This note is already inside the wiki bundle. It was not moved.");
    return;
  }
  const directory = destinationDirectory(io.layout, input.target.logical);
  const relative = `${directory}/${promotedFileName(input.title, await directoryNames(io, directory))}`;
  if (await blocked(io, relative)) {
    return;
  }
  const pageUri = joinContained(io.rootUri, relative);
  if (!pageUri) {
    io.error("The wiki folder must stay inside the project.");
    return;
  }
  await ensureDirectory(io, directory);
  await io.files.writeText(
    pageUri,
    promotePage({
      title: input.title,
      type: input.target.type,
      body: scratchBody(input.text),
      at: input.at,
    }),
  );
  const link = portableMarkdownLink(input.scratchRelative, relative);
  const replaced = await replaceScratch(
    io,
    input.document,
    promotedStub(input.title, link, input.at),
  );
  if (!replaced) {
    io.error(
      "The wiki page was written, but the scratch note could not be replaced.",
    );
    return;
  }
  io.inform(
    `Promoted to ${relative}. The scratch note now links to it. The collection index was not changed. No agent was started.`,
  );
}

function directoryOf(relative: string): string {
  const slash = relative.lastIndexOf("/");
  return slash < 0 ? relative : relative.slice(0, slash);
}

async function directoryNames(
  io: ScratchIO,
  folder: string,
): Promise<readonly string[]> {
  const uri = joinContained(io.rootUri, folder);
  if (!uri) {
    return [];
  }
  return asStrings(await io.files.list(uri));
}

async function ensureDirectory(io: ScratchIO, folder: string): Promise<void> {
  const uri = joinContained(io.rootUri, folder);
  if (!uri) {
    return;
  }
  const listed = await io.files.list(uri);
  if (!Array.isArray(listed)) {
    await io.files.mkdir(uri);
  }
}

async function blocked(io: ScratchIO, relative: string): Promise<boolean> {
  const linked = await walksSymbolicLink(relative, io.rootUri, (uri) =>
    io.files.isSymbolicLink(uri),
  );
  if (linked) {
    io.error("That path follows a symbolic link. Nothing was written.");
  }
  return linked;
}

async function replaceScratch(
  io: ScratchIO,
  document: HostDocument | undefined,
  stub: string,
): Promise<boolean> {
  if (!document || typeof document.getText !== "function") {
    return false;
  }
  return io.apply(document, [replaceAllEdit(document.getText(), stub)]);
}
