/**
 * PDF Workshop: opens PDFs in an EmbedPDF-based viewer, shows their
 * outline in the Explorer, and copies selections in a form agents can locate.
 *
 * Activation only builds the plugin runtime; every capability is a plugin
 * under plugins/ (listed in plugins/catalog.ts), activated in dependency
 * order, each in a transaction that rolls back if it fails, and torn down in
 * reverse order on deactivation.
 */
import * as vscode from 'vscode';
import { plugins } from './plugins/catalog';
import type { PdfServices } from './plugins/services';
import { PluginRuntime } from './runtime/plugin-runtime';

let runtime: PluginRuntime<PdfServices> | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const started = performance.now();
  const log = vscode.window.createOutputChannel('PDF Workshop', { log: true });
  context.subscriptions.push(log);
  runtime = new PluginRuntime<PdfServices>(plugins, log, { context, log });
  await runtime.start();
  log.info(`Activated in ${Math.round(performance.now() - started)} ms`);
}

/** Tear the plugins down, last activated first, before the output channel goes. */
export async function deactivate(): Promise<void> {
  await runtime?.dispose();
  runtime = undefined;
}
