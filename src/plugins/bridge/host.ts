import type { Context, Plugin } from "../../kernel";
import {
  PDF_BRIDGE_COMMAND,
  parseWikiContext,
} from "../../shared/bridge/envelope";
import type { BridgeWikiContext } from "../../shared/bridge/envelope";
import type { Workbench } from "../../shared/runtime";
import type { EditorPanel, SourceSelection } from "../editor/api";
import type { BridgeCapture, MarkdownHandoff } from "./api";
import { envelopeFromPdf, handoffFromSelection } from "./capture";

export const bridgeHost: Plugin = {
  name: "bridge",
  inject: { required: ["workbench"], optional: ["editors", "selections"] },
  apply(ctx) {
    const capture: BridgeCapture = {
      markdownSelection: (wiki) => markdownSelection(ctx, wiki),
      activeSelection: (wiki) => activeSelection(ctx, wiki),
    };
    ctx.provide("bridgeCapture", capture);
    command(ctx, "markdownWorkbench.bridge.copyEnvelope", () =>
      copyEnvelope(ctx),
    );
    command(ctx, "markdownWorkbench.bridge.envelope", (wiki) =>
      activeSelection(ctx, parseWikiContext(wiki)),
    );
  },
};

async function markdownSelection(
  ctx: Context,
  wiki?: BridgeWikiContext,
): Promise<MarkdownHandoff | undefined> {
  const panel = activePanel(ctx);
  if (!panel || !ctx.selections) {
    return undefined;
  }
  const selection = await ctx.selections
    .capture(panel.id)
    .catch(() => undefined);
  if (!isSelection(selection)) {
    return undefined;
  }
  try {
    return handoffFromSelection({
      uri: panel.document.uri,
      viewId: panel.id,
      selection,
      documentText: panel.document.getText(),
      roots: roots(ctx.workbench),
      capturedAt: new Date().toISOString(),
      fingerprint: (text) => ctx.workbench.fingerprint(text),
      ...(wiki ? { wiki } : {}),
    });
  } catch (error) {
    ctx.workbench.error(
      error instanceof Error
        ? error.message
        : "Could not build the bridge envelope.",
    );
    return undefined;
  }
}

async function activeSelection(
  ctx: Context,
  wiki?: BridgeWikiContext,
): Promise<MarkdownHandoff["envelope"] | undefined> {
  const markdown = await markdownSelection(ctx, wiki);
  if (markdown) {
    return markdown.envelope;
  }
  return pdfEnvelope(ctx.workbench);
}

async function copyEnvelope(ctx: Context): Promise<void> {
  const envelope = await activeSelection(ctx);
  if (!envelope) {
    ctx.workbench.error(
      "No selection to copy. Install Agent PDF Viewer to capture a PDF selection.",
    );
    return;
  }
  await ctx.workbench.clipboard.write(JSON.stringify(envelope, null, 2));
  ctx.workbench.inform?.("Copied the bridge envelope. No agent was started.");
}

async function pdfEnvelope(
  workbench: Workbench,
): Promise<MarkdownHandoff["envelope"] | undefined> {
  const known = await workbench.agentEnvironment?.().catch(() => undefined);
  if (known?.commands && !known.commands.has(PDF_BRIDGE_COMMAND)) {
    return undefined;
  }
  try {
    return envelopeFromPdf(await workbench.execute(PDF_BRIDGE_COMMAND));
  } catch {
    return undefined;
  }
}

function activePanel(ctx: Context): EditorPanel | undefined {
  const panel = ctx.editors?.active();
  if (!panel || typeof panel.document?.getText !== "function") {
    return undefined;
  }
  return panel;
}

function isSelection(value: unknown): value is SourceSelection {
  if (!value || typeof value !== "object") {
    return false;
  }
  const selection = value as SourceSelection;
  return (
    typeof selection.text === "string" &&
    typeof selection.startLine === "number" &&
    typeof selection.endLine === "number"
  );
}

function roots(workbench: Workbench): readonly string[] {
  const listed = workbench.workspaceFolders?.();
  if (!Array.isArray(listed)) {
    return [];
  }
  return listed.filter((item): item is string => typeof item === "string");
}

function command(
  ctx: Context,
  id: string,
  run: (...args: unknown[]) => unknown,
): void {
  const views = ctx.workbench.views;
  if (!views) {
    return;
  }
  ctx.effect(() =>
    views.command(id, (...args) => {
      void Promise.resolve(run(...args)).catch((error: unknown) => {
        ctx.workbench.error(
          error instanceof Error ? error.message : "Command failed",
        );
      });
    }),
  );
}
