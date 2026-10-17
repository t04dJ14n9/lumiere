/**
 * PDF Workshop: opens PDFs in an EmbedPDF-based viewer, shows their
 * outline in the Explorer, and copies selections in a form agents can locate.
 *
 * Activation only builds the plugin tree; every capability is a plugin under
 * plugins/ (listed in plugins/catalog.ts). Each starts once the services it
 * injects exist, and deactivation stops them, last started first.
 */
import * as vscode from "vscode";
import { createRoot, type RootContext } from "@workshop/core";
import { plugins } from "./plugins/catalog";
import "./plugins/services";

let root: RootContext | undefined;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const started = performance.now();
  const log = vscode.window.createOutputChannel("PDF Workshop", { log: true });
  context.subscriptions.push(log);
  root = createRoot({
    logger: {
      debug: (message) => log.debug(message),
      warn: (message, details) => log.warn(message, details ?? ""),
      error: (message, details) => log.error(message, details ?? ""),
    },
  });
  root.provide("extensionContext", context);
  root.provide("pdfLog", log);
  for (const plugin of plugins) {
    root.plugin(plugin);
  }
  await root.settled();
  log.info(`Activated in ${Math.round(performance.now() - started)} ms`);
}

/** Stop the plugins, last started first, before the output channel goes. */
export async function deactivate(): Promise<void> {
  const stopping = root;
  root = undefined;
  await stopping?.dispose();
}
