/**
 * Following links in DSH. Resolving a link (and creating the note it names)
 * works as in VS Code; opening one is DSH's to do: an open note's page reveals
 * the target itself, any other file opens in a new tab of DSH's sidebar.
 */
import { constants } from "node:fs";
import { mkdir, open as openFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RevealRouter,
  type HostSettings,
  type Navigation,
  type NavigationIntent,
  type NavigationTarget,
} from "@workshop/markdown/portable";
import { questionId, type LivePanel } from "./panel";
import type { PanelHub } from "./panels";
import { presentingPanel } from "./ui-services";
import { isInside } from "./vault";

/** How long a new tab's page may take to open before its reveal is dropped. */
const OPEN_TIMEOUT_MS = 15_000;

export function createDshNavigation(
  panels: PanelHub,
  settings: HostSettings,
): Navigation {
  const reveals = new RevealRouter();
  return {
    begin: () => reveals.begin(),
    registerReveal: (panel) => reveals.register(panel),
    registerNativeLinks: () => () => {},
    scheme: "dsh",
    async external(href) {
      presentingPanel(panels)?.tell({ type: "external", href });
      return true;
    },
    async confirm(message) {
      const answer = await presentingPanel(panels)?.ask({
        type: "ask",
        id: questionId(),
        message,
        actions: ["Open"],
      });
      return answer === "Open";
    },
    resolve: (request) =>
      resolveLink({
        ...request,
        newNoteFolder:
          request.newNoteFolder ??
          settings.get("files.newNoteFolder", "", request.source),
      }),
    async open(
      ...[root, uri, fragment, , at, intent]: Parameters<Navigation["open"]>
    ) {
      assertInside(root, uri);
      const destination: NavigationTarget = {
        fragment,
        ...(at === undefined ? {} : { at }),
      };
      await openTarget({ panels, reveals, uri, destination, intent });
    },
  };
}

type ResolveRequest = Parameters<Navigation["resolve"]>[0];

/** The file a link names, or the note created for it; undefined when there is none. */
export async function resolveLink(
  request: ResolveRequest,
): Promise<string | undefined> {
  const { root, source, path: link, create, folderNote, intent } = request;
  const base = fileURLToPath(root);
  let target = !link
    ? fileURLToPath(source)
    : path.join(
        link.startsWith("/") || create
          ? base
          : path.dirname(fileURLToPath(source)),
        link.replace(/^\//, ""),
      );
  assertInside(root, pathToFileURL(target).toString());
  const info = await stat(target).catch(() => undefined);
  if (intent?.token.cancelled) {
    return undefined;
  }
  if (info?.isDirectory()) {
    if (!folderNote) {
      return undefined;
    }
    target = path.join(target, folderNote);
    assertInside(root, pathToFileURL(target).toString());
  }
  if (info) {
    return pathToFileURL(target).toString();
  }
  return create && !intent?.token.cancelled
    ? createNote({ base, root, request, target })
    : undefined;
}

async function createNote(options: {
  base: string;
  root: string;
  request: ResolveRequest;
  target: string;
}): Promise<string> {
  const { base, root, request } = options;
  let target = options.target;
  const link = request.path;
  if (!link.startsWith("/")) {
    const folder = request.newNoteFolder ?? "";
    const parent =
      folder === "."
        ? path.dirname(fileURLToPath(request.source))
        : path.join(base, folder);
    target = path.join(parent, link);
  }
  if (!/\.md$/i.test(target)) {
    target += ".md";
  }
  const uri = pathToFileURL(target).toString();
  assertInside(root, uri);
  await mkdir(path.dirname(target), { recursive: true });
  // Never overwrite: a note created meanwhile is the one to open.
  const handle = await openFile(target, constants.O_CREAT | constants.O_WRONLY);
  await handle.close();
  return uri;
}

function assertInside(root: string, uri: string): void {
  if (!isInside(root, uri)) {
    throw new Error("That link points outside the vault");
  }
}

interface OpenTarget {
  panels: PanelHub;
  reveals: RevealRouter;
  uri: string;
  destination: NavigationTarget;
  intent: NavigationIntent | undefined;
}

async function openTarget(options: OpenTarget): Promise<void> {
  const { panels, reveals, uri, destination } = options;
  const intent = options.intent ?? reveals.begin();
  const hasDestination =
    destination.fragment !== "" || destination.at !== undefined;
  const shown = panels.all().find((panel) => panel.document.uri === uri);
  if (shown) {
    if (hasDestination) {
      await reveals.deliver(intent, shown.id, destination);
    }
    return;
  }
  const opened = nextPanelFor(panels, uri);
  presentingPanel(panels)?.tell({
    type: "open",
    path: fileURLToPath(uri),
    fragment: destination.fragment,
  });
  const panel = await opened;
  if (panel && hasDestination && !intent.token.cancelled) {
    await reveals.deliver(intent, panel.id, destination);
  }
}

/** The next panel opened for `uri`, or undefined if none opens in time. */
function nextPanelFor(
  panels: PanelHub,
  uri: string,
): Promise<LivePanel | undefined> {
  return new Promise((resolve) => {
    const stop = panels.onOpened((panel) => {
      if (panel.document.uri === uri) {
        finish(panel);
      }
    });
    const timer = setTimeout(() => finish(undefined), OPEN_TIMEOUT_MS);
    timer.unref?.();
    function finish(panel: LivePanel | undefined): void {
      clearTimeout(timer);
      stop();
      resolve(panel);
    }
  });
}
