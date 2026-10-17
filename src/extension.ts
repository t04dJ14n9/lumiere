/**
 * Workshop: Markdown and PDF. The composition root of the extension: one
 * plugin tree (see @workshop/core) for both products, its output channel,
 * and the services every plugin may inject from the root. Each product adds
 * its own plugins; deactivation stops them all, last started first.
 */
import { window, workspace, type ExtensionContext } from "vscode";
import { createRoot, type RootContext } from "@workshop/core";
import {
  outputLogger,
  pluginRank,
  startMarkdown,
  type MarkdownWorkshopApi,
} from "@workshop/markdown/host";
import { startPdf } from "@workshop/pdf/host";
import { markdownNoteSelections } from "./note-selections";

let root: RootContext | undefined;

export async function activate(
  context: ExtensionContext,
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
  // Provided before PDF starts, so its agent bridge does not restart when
  // Markdown Workshop's API arrives.
  const markdown: { api?: MarkdownWorkshopApi } = {};
  root.provide(
    "noteSelections",
    markdownNoteSelections(() => markdown.api),
  );
  startPdf(root);
  const api = await startMarkdown(root, context);
  markdown.api = api;
  await root.settled();
  channel.info(`Activated in ${Math.round(performance.now() - started)} ms`);
  return api;
}

/** VS Code awaits this (unlike subscriptions' disposal), so teardown completes. */
export async function deactivate(): Promise<void> {
  const stopping = root;
  root = undefined;
  await stopping?.dispose();
}
