import type { Context } from "../../kernel";
import type { EditorPanel } from "../../plugins/editor/api";
import { protocol as jumps } from "../../plugins/editor/jump-protocol";
import { protocol } from "../../plugins/editor/protocol";
import { SourceCoordinates } from "../../shared/document/coordinates";
import { noteFragment } from "../../markdown/metadata/fragments";
import { RpcError, CancelToken } from "../../shared/rpc/lifecycle";
import type { ApiPlatform } from "./platform";
import type { MarkdownWorkbenchApi, SourceTarget, OpenOptions } from "./types";
import { editorSnapshot } from "./snapshots";
import { withCancellation } from "./cancellation";
import type { Uri } from "vscode";
export function panelById(root: Context, id: string): EditorPanel {
  const panel = root.editors.all().find((panel) => panel.id === id);
  if (!panel) {
    throw new RpcError("EditorNotFound", `Editor ${id} is not open`);
  }
  return panel;
}
const activeRevisions = new WeakMap<Context, number>();
export function editorOperations(
  root: Context,
  platform: ApiPlatform,
): Pick<
  MarkdownWorkbenchApi,
  "getEditors" | "getActiveEditor" | "open" | "reveal" | "getSelection"
> {
  if (!activeRevisions.has(root)) {
    activeRevisions.set(root, 0);
    let active = root.editors.active()?.id;
    root.on("editor/activeChanged", (panel) => {
      if (panel?.id !== active) {
        active = panel?.id;
        activeRevisions.set(root, (activeRevisions.get(root) ?? 0) + 1);
      }
    });
  }
  return {
    getEditors: () =>
      Object.freeze(
        root.editors.all().map((panel) => editorSnapshot(panel, platform)),
      ),
    getActiveEditor: () => {
      const panel = root.editors.active();
      return panel && editorSnapshot(panel, platform);
    },
    open: (uri, options = {}) => openEditor(root, platform, uri, options),
    reveal: (id, target, options) =>
      reveal(root, id, target, options?.focus ?? true),
    getSelection: (id, options) =>
      withCancellation(options?.token, (token) =>
        root.selections.capture(id, token),
      ),
  };
}
async function openEditor(
  root: Context,
  platform: ApiPlatform,
  uri: Uri,
  options: OpenOptions,
) {
  validateUri(uri);
  if (
    options.viewColumn !== undefined &&
    (!Number.isInteger(options.viewColumn) ||
      Number(options.viewColumn) === 0 ||
      options.viewColumn < -2)
  ) {
    throw new RpcError("InvalidArgument", "Invalid view column");
  }
  const before = new Set(root.editors.all().map((panel) => panel.id));
  await platform.open(uri, options);
  const candidates = root.editors
    .all()
    .filter(
      (panel) =>
        panel.document.uri === uri.toString() &&
        (!options.viewColumn ||
          options.viewColumn < 0 ||
          panel.column === options.viewColumn),
    );
  const panel =
    candidates.find((panel) => !before.has(panel.id)) ??
    candidates.find((panel) => panel.active()) ??
    candidates.at(-1);
  if (!panel) {
    throw new RpcError(
      "EditorNotFound",
      "Opening did not create or reveal an editor",
    );
  }
  if (options.reveal) {
    await reveal(root, panel.id, options.reveal, !options.preserveFocus);
  } else {
    await waitForReady(panel);
    panelById(root, panel.id);
  }
  return editorSnapshot(panel, platform);
}
export async function waitForReady(panel: EditorPanel): Promise<void> {
  if (!panel.ready) {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      panel.ready,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new RpcError("Cancelled", "Editor initialization timed out"),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const reveals = new WeakMap<EditorPanel, CancelToken>();
async function reveal(
  root: Context,
  id: string,
  target: SourceTarget,
  focus: boolean,
): Promise<void> {
  const panel = panelById(root, id);
  reveals.get(panel)?.cancel();
  const token = new CancelToken();
  reveals.set(panel, token);
  const check = revealGuard(root, panel, token);
  try {
    await waitForReady(panel);
    check();
    const navigation = await panel.rpc.call(
      jumps,
      "navigationState",
      {},
      { token },
    );
    check();
    await panel.session.flush();
    check();
    const current = await panel.rpc.call(
      jumps,
      "navigationState",
      {},
      { token },
    );
    check();
    assertReader(navigation, current);
    const coordinates = new SourceCoordinates(panel.document.getText());
    const range = targetRange(coordinates, target);
    if (focus) {
      panel.reveal();
    }
    const applied = await panel.rpc.call(
      protocol,
      "reveal",
      {
        ...range,
        focus,
        version: panel.session.version,
        navigation,
      },
      { token },
    );
    if (!applied) {
      throw new RpcError(
        "Cancelled",
        "The target changed before navigation completed",
      );
    }
  } finally {
    if (reveals.get(panel) === token) {
      reveals.delete(panel);
    }
  }
}
function revealGuard(root: Context, panel: EditorPanel, token: CancelToken) {
  const active = root.editors.active();
  const revision = activeRevisions.get(root);
  const generation = panel.webviewGeneration;
  return () => {
    if (
      token.cancelled ||
      activeRevisions.get(root) !== revision ||
      panelById(root, panel.id) !== panel ||
      panel.webviewGeneration !== generation ||
      root.editors.active() !== active
    ) {
      throw new RpcError("Cancelled", "Navigation was superseded");
    }
  };
}

export function targetRange(
  coordinates: SourceCoordinates,
  target: SourceTarget,
): { from: number; to: number } {
  if (!target || typeof target !== "object") {
    throw new RpcError("InvalidArgument", "A source target is required");
  }
  if (
    "startLine" in target &&
    "endLine" in target &&
    Object.keys(target).length === 2
  ) {
    return lineRange(coordinates, target.startLine, target.endLine);
  }
  if ("line" in target && Object.keys(target).length === 1) {
    const { from } = lineRange(coordinates, target.line, target.line);
    return { from, to: from };
  }
  if (
    "fragment" in target &&
    typeof target.fragment === "string" &&
    Object.keys(target).length === 1
  ) {
    const range = noteFragment(
      coordinates.editor.toString(),
      target.fragment.replace(/^#/, ""),
    );
    if (!range) {
      throw new RpcError("InvalidArgument", "Fragment was not found");
    }
    return { from: range.from, to: range.from };
  }
  if (isOffsetRange(target, coordinates.source.length)) {
    return {
      from: coordinates.toEditor(target.from),
      to: coordinates.toEditor(target.to),
    };
  }

  throw new RpcError("InvalidArgument", "Invalid source range");
}

function lineRange(coordinates: SourceCoordinates, start: number, end: number) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start ||
    end > coordinates.editor.lines
  ) {
    throw new RpcError("InvalidArgument", "Line range is outside the document");
  }
  return {
    from: coordinates.editor.line(start).from,
    to: coordinates.editor.line(end).to,
  };
}
export function validateUri(uri: Uri): void {
  if (
    !uri ||
    typeof uri.scheme !== "string" ||
    !uri.scheme ||
    typeof uri.toString !== "function"
  ) {
    throw new RpcError("InvalidArgument", "A URI is required");
  }
}

function isOffsetRange(
  target: SourceTarget,
  length: number,
): target is { from: number; to: number } {
  return (
    "from" in target &&
    "to" in target &&
    Object.keys(target).length === 2 &&
    Number.isSafeInteger(target.from) &&
    Number.isSafeInteger(target.to) &&
    target.from >= 0 &&
    target.to >= target.from &&
    target.to <= length
  );
}

function assertReader(
  before: { session: string; generation: number },
  after: { session: string; generation: number },
): void {
  if (
    before.session !== after.session ||
    before.generation !== after.generation
  ) {
    throw new RpcError("Cancelled", "The reader moved before navigation");
  }
}
