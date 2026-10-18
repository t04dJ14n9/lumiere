/**
 * Workshop: Markdown and PDF. The composition root of the extension: one
 * plugin tree (see @workshop/core) for both products, its output channel,
 * and the services every plugin may inject from the root. Each product adds
 * its own plugins; deactivation stops them all, last started first.
 *
 * The two entry points, src/extension.ts (desktop) and src/extension.web.ts
 * (browser), differ only in the runtime they pass: the platform, and what
 * only the desktop has.
 */
import { window, workspace, type ExtensionContext } from "vscode";
import { createRoot, type Plugin, type RootContext } from "@workshop/core";
import {
  outputLogger,
  pluginRank,
  startMarkdown,
  type GitAccess,
  type MarkdownWorkshopApi,
} from "@workshop/markdown/host";
import { startPdf } from "@workshop/pdf/host";
import { providePlatform, type HostPlatform } from "@workshop/platform";
import { markdownNoteSelections } from "./note-selections";

/** Where the extension runs, and what it can do there. */
export interface Runtime {
  platform: HostPlatform;
  /** Git access, where the host has Git (`@workshop/markdown/desktop`). */
  git?: GitAccess;
  /** PDF Workshop's plugins for this platform (`@workshop/pdf/desktop`). */
  pdfPlugins: readonly Plugin[];
}

let root: RootContext | undefined;

export async function activateWorkshop(
  context: ExtensionContext,
  runtime: Runtime,
): Promise<MarkdownWorkshopApi> {
  const started = performance.now();
  const channel = window.createOutputChannel("Workshop", { log: true });
  context.subscriptions.push(channel);
  const debugLogging = () =>
    workspace.getConfiguration("markdownWorkshop").get("debug.logging", false);
  root = createRoot({
    rank: pluginRank,
    logger: outputLogger(channel, debugLogging),
  });
  root.provide("extensionContext", context);
  root.provide("outputChannel", channel);
  providePlatform(root, runtime.platform);
  // Provided before PDF starts, so its agent bridge does not restart when
  // Markdown Workshop's API arrives.
  const markdown: { api?: MarkdownWorkshopApi } = {};
  root.provide(
    "noteSelections",
    markdownNoteSelections(() => markdown.api),
  );
  startPdf(root, runtime.pdfPlugins);
  const api = await startMarkdown(root, context, runtime);
  markdown.api = api;
  await root.settled();
  channel.info(`Activated in ${Math.round(performance.now() - started)} ms`);
  return api;
}

/** VS Code awaits this (unlike subscriptions' disposal), so teardown completes. */
export async function deactivateWorkshop(): Promise<void> {
  const stopping = root;
  root = undefined;
  await stopping?.dispose();
}
