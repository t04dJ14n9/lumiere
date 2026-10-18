import * as vscode from "vscode";
import type { Digests } from "@workshop/platform";
import { LinkTickets, type Ticket } from "./link-tickets";
import { nativeLinks, localFragment } from "../../../shared/native-links";

export interface LinkRun {
  current(): boolean;
  cancel(): void;
}
interface LinkOptions {
  command: string;
  /** Signs the links' tickets. */
  digests: Digests;
  accepts(path: string, fragment: string): boolean;
  authorize(root: vscode.Uri, target: vscode.Uri): Promise<void>;
  begin(): LinkRun;
  open(
    target: vscode.Uri,
    root: vscode.Uri,
    column: number,
    run: LinkRun,
  ): Promise<void>;
}
/** Own only precise local inline links; VS Code merges overlapping href ranges. */
export function registerSourceLinks(options: LinkOptions): vscode.Disposable {
  const links = new SourceLinks(options);
  return vscode.Disposable.from(
    vscode.languages.registerDocumentLinkProvider(
      { language: "markdown", scheme: "file" },
      links,
    ),
    vscode.commands.registerCommand(
      options.command,
      (payload: unknown, signature: unknown) => links.open(payload, signature),
    ),
    new vscode.Disposable(() => links.dispose()),
  );
}

class SourceLinks implements vscode.DocumentLinkProvider {
  private readonly tickets: LinkTickets;
  private pending: LinkRun | undefined;
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly options: LinkOptions) {
    this.tickets = new LinkTickets(options.digests);
  }

  provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.DocumentLink[] {
    if (
      token.isCancellationRequested ||
      !vscode.workspace.getWorkspaceFolder(document.uri)
    ) {
      return [];
    }
    const text = document.getText();
    return nativeLinks(text).flatMap((link) => {
      const parts = localFragment(link.href);
      if (
        !parts ||
        !this.options.accepts(parts.path || document.uri.path, parts.fragment)
      ) {
        return [];
      }
      const ticket = {
        source: document.uri.toString(),
        version: document.version,
        ...link,
        raw: text.slice(link.from, link.to),
      };
      const signed = this.tickets.issue(ticket);
      if (signed[0].length > 32_768) {
        return [];
      }
      return [
        new vscode.DocumentLink(
          new vscode.Range(
            document.positionAt(link.from),
            document.positionAt(link.to),
          ),
          vscode.Uri.parse(
            `command:${this.options.command}?${encodeURIComponent(JSON.stringify(signed))}`,
          ),
        ),
      ];
    });
  }

  async open(payload: unknown, signature: unknown): Promise<boolean> {
    const ticket = this.tickets.read(payload, signature);
    const source = vscode.window.activeTextEditor;
    if (!ticket || !source || !matches(ticket, source.document)) {
      return false;
    }
    this.pending?.cancel();
    const run = this.options.begin();
    this.pending = run;
    const stop = watchSource(run, source, ticket);
    const column =
      source.viewColumn ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
    const task = this.queue.then(() =>
      follow(this.options, ticket, column, run),
    );
    this.queue = task.then(
      () => {},
      () => {},
    );
    try {
      return await boundedResult(task, run);
    } finally {
      stop.dispose();
    }
  }

  dispose(): void {
    this.pending?.cancel();
    this.tickets.dispose();
  }
}

async function boundedResult(
  task: Promise<boolean>,
  run: LinkRun,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<false>((resolve) => {
        // Keep the serialization barrier even if the host's uncancellable open stalls.
        timer = setTimeout(() => {
          run.cancel();
          resolve(false);
        }, 20_000);
      }),
    ]);
  } catch (error) {
    if (run.current()) {
      void vscode.window.showWarningMessage(
        `Could not open precise link: ${String(error)}`,
      );
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function matches(ticket: Ticket, document: vscode.TextDocument): boolean {
  return (
    document.uri.toString() === ticket.source &&
    document.version === ticket.version &&
    document.getText().slice(ticket.from, ticket.to) === ticket.raw
  );
}

async function follow(
  options: LinkOptions,
  ticket: Ticket,
  column: number,
  run: LinkRun,
): Promise<boolean> {
  if (!run.current()) {
    return false;
  }
  const source = vscode.Uri.parse(ticket.source);
  const root = vscode.workspace.getWorkspaceFolder(source)?.uri;
  const parts = localFragment(ticket.href);
  if (!root || !parts) {
    return false;
  }
  const target = !parts.path
    ? source
    : vscode.Uri.joinPath(
        parts.path.startsWith("/") ? root : vscode.Uri.joinPath(source, ".."),
        parts.path.replace(/^\//, ""),
      );
  await options.authorize(root, target);
  const stat = await vscode.workspace.fs.stat(target);
  if (!(stat.type & vscode.FileType.File)) {
    throw new Error("Target is not a file");
  }
  if (!run.current()) {
    return false;
  }
  const document = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === ticket.source,
  );
  if (document && !matches(ticket, document)) {
    return false;
  }
  if (!(await readySourceTab(ticket, column, run))) {
    run.cancel();
    return false;
  }
  await options.open(
    target.with({ fragment: parts.fragment }),
    root,
    column,
    run,
  );
  return run.current();
}

/** Both VS Code's link and definition gestures may open the expected target. */
function ownsTab(ticket: Ticket, column: number): boolean {
  const group = vscode.window.tabGroups.activeTabGroup;
  if (group.viewColumn !== column) {
    return false;
  }
  const input = group.activeTab?.input;
  if (
    !(input instanceof vscode.TabInputText) &&
    !(input instanceof vscode.TabInputCustom)
  ) {
    return false;
  }
  const uri = input.uri.with({ fragment: "" }).toString();
  const source = vscode.Uri.parse(ticket.source);
  const root = vscode.workspace.getWorkspaceFolder(source)?.uri;
  const parts = localFragment(ticket.href);
  if (!root || !parts) {
    return false;
  }
  const target = !parts.path
    ? source
    : vscode.Uri.joinPath(
        parts.path.startsWith("/") ? root : vscode.Uri.joinPath(source, ".."),
        parts.path.replace(/^\//, ""),
      );
  return uri === source.toString() || uri === target.toString();
}

/** Unrelated reader departure retires preflight; expected native transitions coexist. */
function watchSource(
  run: LinkRun,
  source: vscode.TextEditor,
  ticket: Ticket,
): vscode.Disposable {
  const column =
    source.viewColumn ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
  const ranges = JSON.stringify(source.visibleRanges);
  const stop = vscode.Disposable.from(
    watchTabOwnership(run, ticket, column),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (
        event.textEditor === source &&
        vscode.window.activeTextEditor === source &&
        JSON.stringify(event.visibleRanges) !== ranges
      ) {
        run.cancel();
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (
        event.textEditor !== source ||
        (event.kind !== vscode.TextEditorSelectionChangeKind.Keyboard &&
          event.kind !== vscode.TextEditorSelectionChangeKind.Mouse)
      ) {
        return;
      }
      const at = source.document.offsetAt(event.selections[0]!.active);
      // The initial Cmd-click may move the caret within this very href.
      if (
        event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
        at < ticket.from ||
        at > ticket.to
      ) {
        run.cancel();
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === source.document) {
        run.cancel();
      }
    }),
  );
  return stop;
}

/** Cursor briefly reports no tab input while replacing an editor with a custom pane. */
function watchTabOwnership(
  run: LinkRun,
  ticket: Ticket,
  column: number,
): vscode.Disposable {
  let transition: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(transition);
    transition = undefined;
  };
  const check = () => {
    const group = vscode.window.tabGroups.activeTabGroup;
    if (group.viewColumn === column && group.activeTab?.input === undefined) {
      transition ??= setTimeout(() => {
        transition = undefined;
        if (!ownsTab(ticket, column)) {
          run.cancel();
        }
      }, 250);
      return;
    }
    clear();
    if (!ownsTab(ticket, column)) {
      run.cancel();
    }
  };
  return vscode.Disposable.from(
    vscode.window.onDidChangeActiveTextEditor(check),
    vscode.window.tabGroups.onDidChangeTabs(check),
    vscode.window.tabGroups.onDidChangeTabGroups(check),
    new vscode.Disposable(clear),
  );
}

/** Preflight may finish during the same short custom-tab replacement window. */
async function readySourceTab(
  ticket: Ticket,
  column: number,
  run: LinkRun,
): Promise<boolean> {
  const deadline = Date.now() + 250;
  while (run.current() && Date.now() < deadline) {
    if (ownsTab(ticket, column)) {
      return true;
    }
    const group = vscode.window.tabGroups.activeTabGroup;
    if (group.viewColumn !== column || group.activeTab?.input !== undefined) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}
