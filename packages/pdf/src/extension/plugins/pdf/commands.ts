import * as path from "node:path";
import * as vscode from "vscode";
import {
  extractPdfLink,
  parseLocationFragment,
  parsePdfLocation,
} from "../../../shared/pdf-location";
import { resolvePdfCandidates } from "../../../shared/pdf-target-resolution";
import { VIEW_TYPE, type PdfPanels } from "./panels";
import { OPEN_LOCATION_COMMAND_ID } from "../../../shared/command-ids";

/** PDF: Open Location, which makes the viewer a navigation target for links and other extensions. */
export function registerOpenLocation(panels: PdfPanels): vscode.Disposable {
  let generation = 0;
  let pending: vscode.CancellationTokenSource | undefined;
  // Native editor resolution cannot be cancelled once dispatched. Serialize it
  // so an older slow open can never finish after the newest queued destination.
  let opening: Promise<void> = Promise.resolve();
  const dispatch = (run: () => Promise<boolean>): Promise<boolean> => {
    const result = opening.then(run);
    opening = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const command = vscode.commands.registerCommand(
    OPEN_LOCATION_COMMAND_ID,
    async (target?: unknown, location?: unknown, options?: unknown) => {
      pending?.cancel();
      pending?.dispose();
      const cancellation = new vscode.CancellationTokenSource();
      pending = cancellation;
      const request = ++generation;
      try {
        return await openLocation(panels, target, location, {
          current: () => request === generation,
          token: cancellation.token,
          dispatch,
          column: viewColumnOf(options),
        });
      } finally {
        if (pending === cancellation) {
          pending = undefined;
        }
        cancellation.dispose();
      }
    },
  );
  return new vscode.Disposable(() => {
    generation++;
    pending?.cancel();
    pending?.dispose();
    command.dispose();
  });
}

/** One Open Location request, superseded by the next. */
interface OpenRequest {
  /** False once a newer request has started. */
  current(): boolean;
  token: vscode.CancellationToken;
  /** Runs the native open after any earlier one. */
  dispatch(run: () => Promise<boolean>): Promise<boolean>;
  /** Where to open the PDF; the active group by default. */
  column: vscode.ViewColumn | undefined;
}

/** `{ viewColumn }` from a caller such as a note's link; anything else is ignored. */
function viewColumnOf(options: unknown): vscode.ViewColumn | undefined {
  const column = (options as { viewColumn?: unknown } | undefined)?.viewColumn;
  return typeof column === "number" && Number.isInteger(column) && column >= -2
    ? column
    : undefined;
}

type PdfDestination = ReturnType<typeof parsePdfLocation>;

/**
 * Open a PDF at a page (and box). With no arguments, ask for a link such as
 * one an agent printed: `papers/paper.pdf#page=3&viewrect=72,83,134,21`.
 * Other extensions can pass a URI and a location:
 *
 *     vscode.commands.executeCommand('lumiere.pdf.openLocation', uri, { page: 3 })
 *
 * A third argument, `{ viewColumn }`, opens it in another editor group
 * (`ViewColumn.Beside` for a link opened to the side).
 */
async function openLocation(
  panels: PdfPanels,
  target: unknown,
  location: unknown,
  request: OpenRequest,
): Promise<boolean> {
  const link = target ?? (await askForLink(request.token));
  if (link === undefined || !request.current()) {
    return false;
  }
  const resolved = await resolvePdfUri(link, request);
  if (!request.current() || resolved.status === "cancelled") {
    return false;
  }
  if (resolved.status !== "found") {
    void vscode.window.showWarningMessage(
      `No readable PDF file found at ${String(link)}`,
    );
    return false;
  }
  const uri = resolved.target;
  const destination =
    location !== undefined
      ? parsePdfLocation(location)
      : parseLocationFragment(uri.fragment);
  if ((location !== undefined || uri.fragment.length > 0) && !destination) {
    void vscode.window.showWarningMessage(
      "The PDF location is invalid. Use a positive whole page number, optionally with a valid viewrect.",
    );
    return false;
  }
  return request.dispatch(() =>
    openAt(panels, uri.with({ fragment: "" }), destination, request),
  );
}

function askForLink(
  token: vscode.CancellationToken,
): Thenable<string | undefined> {
  return vscode.window.showInputBox(
    {
      title: "Open PDF at Location",
      prompt:
        "A PDF path or link, optionally with #page=… and &viewrect=…, or a Source line copied for an agent",
      placeHolder: "papers/paper.pdf#page=3&viewrect=72,83,134,21",
    },
    token,
  );
}

/** Open the viewer on `file` and go to `destination`, unless superseded. */
async function openAt(
  panels: PdfPanels,
  file: vscode.Uri,
  destination: PdfDestination,
  request: OpenRequest,
): Promise<boolean> {
  if (!request.current()) {
    return false;
  }
  await vscode.commands.executeCommand(
    "vscode.openWith",
    file,
    VIEW_TYPE,
    ...(request.column === undefined ? [] : [request.column]),
  );
  if (!request.current()) {
    return false;
  }
  const panel = await panels.waitFor(file);
  if (!panel || !request.current()) {
    return false;
  }
  if (destination) {
    panel.goTo(destination);
  }
  return true;
}

/**
 * A URI, a `file:` URL, an absolute path, or a path inside a workspace
 * folder; given as text, it can also be wrapped in a Markdown link.
 */
async function resolvePdfUri(
  target: unknown,
  request: Pick<OpenRequest, "current" | "token">,
): Promise<
  { status: "found"; target: vscode.Uri } | { status: "missing" | "cancelled" }
> {
  const candidates = candidatesFor(target);
  if (!candidates) {
    return { status: "missing" };
  }
  return resolvePdfCandidates(
    candidates,
    (uri) => uri.toString(),
    (uri) => isPdfFile(uri, request.current),
    (matches) => pickPdf(matches, request),
  );
}

/** The URIs `target` may mean; undefined when it cannot mean any. */
function candidatesFor(target: unknown): vscode.Uri[] | undefined {
  if (target instanceof vscode.Uri) {
    return [target];
  }
  if (typeof target !== "string" || !target.trim()) {
    return undefined;
  }
  const text = extractPdfLink(target);
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      return [vscode.Uri.parse(text)];
    }
    const hash = text.indexOf("#");
    const file = hash < 0 ? text : text.slice(0, hash);
    const fragment = hash < 0 ? "" : text.slice(hash + 1);
    const files = path.isAbsolute(file)
      ? [vscode.Uri.file(file)]
      : (vscode.workspace.workspaceFolders ?? []).map((folder) =>
          vscode.Uri.joinPath(folder.uri, file),
        );
    return files.map((uri) => uri.with({ fragment }));
  } catch {
    return undefined;
  }
}

async function isPdfFile(
  uri: vscode.Uri,
  current: () => boolean,
): Promise<boolean> {
  if (!current() || !/\.pdf$/iu.test(uri.path)) {
    return false;
  }
  try {
    const stat = await vscode.workspace.fs.stat(uri.with({ fragment: "" }));
    return (
      (stat.type & vscode.FileType.File) !== 0 &&
      (stat.type & vscode.FileType.Directory) === 0
    );
  } catch {
    return false;
  }
}

/** Ask which folder's copy to open when a relative path exists in several. */
async function pickPdf(
  matches: readonly vscode.Uri[],
  request: Pick<OpenRequest, "current" | "token">,
): Promise<vscode.Uri | undefined> {
  if (!request.current()) {
    return undefined;
  }
  const choice = await vscode.window.showQuickPick(
    matches.map((uri) => ({
      label: path.basename(uri.path),
      description: uri.fsPath,
      uri,
    })),
    {
      title: "Choose the PDF to open",
      placeHolder:
        "This relative path exists in more than one workspace folder",
    },
    request.token,
  );
  return choice?.uri;
}
