import type { Context, Disposer, Plugin } from "@workshop/core";
import { registerReportedCommands } from "../../shared/reported-command";
import { contributionId } from "../../shared/setting-schema";
import { asString, asStrings } from "../../shared/values";
import { containingFolder } from "../../shared/workspace-path";
import type { BridgeCapture } from "../bridge/api";
import { copyWikiReference } from "./copy";
import { placeFor } from "./lookup";
import type { WikiSession } from "./session";
import { layoutService, reloadWiki } from "./session";
import { layoutSummary } from "./summary";

const REFRESH_DELAY_MS = 200;

/** Reads `.wiki` layout and registry. It copies references and never runs an agent. */
export const wikiHost: Plugin = {
  name: "wiki",
  inject: {
    required: [
      "hostDocuments",
      "hostCommands",
      "clipboard",
      "dialogs",
      "activeEditor",
      "workspace",
    ],
    optional: ["editors", "bridgeCapture"],
  },
  provides: ["wikiLayout"],
  apply(ctx) {
    const state: WikiSession = { projects: [], problems: [], generation: 0 };
    const reload = () => reloadWiki(ctx, state);
    ctx.provide("wikiLayout", layoutService(state, reload));
    const effect = (setup: () => Disposer) => {
      ctx.effect(setup);
    };
    const report = (message: string) => {
      if (ctx.isLive) {
        ctx.dialogs.error(message);
      }
    };
    registerReportedCommands(effect, ctx.hostCommands, report, [
      {
        id: contributionId("wiki.copyForAgent"),
        run: () => copyReference(ctx, state, false),
      },
      {
        id: contributionId("wiki.copyEnvelope"),
        run: () => copyReference(ctx, state, true),
      },
      {
        id: contributionId("wiki.showLayout"),
        run: () => showLayout(ctx, state),
      },
      { id: contributionId("wiki.refresh"), run: () => reload() },
    ]);
    bindRefresh(ctx, reload, report);
  },
};

function bindRefresh(
  ctx: Context,
  reload: () => Promise<void>,
  report: (message: string) => void,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    void reload().catch((error: unknown) => {
      report(
        error instanceof Error ? error.message : "Could not read the wiki.",
      );
    });
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, REFRESH_DELAY_MS);
  };
  ctx.effect(() => ctx.activeEditor.onNoteChanged(schedule));
  ctx.effect(() => ctx.hostDocuments.onChange(schedule));
  ctx.effect(() => ctx.hostDocuments.onSave(schedule));
  // Captured while live: teardown runs after this context is disposed.
  const diagnostics = ctx.workspace.diagnostics;
  ctx.effect(() => () => {
    clearTimeout(timer);
    diagnostics.clear("wiki");
  });
  run();
}

async function copyReference(
  ctx: Context,
  state: WikiSession,
  json: boolean,
): Promise<void> {
  const note = activeNote(ctx);
  const place = note.uri ? placeFor(state.projects, note.uri) : undefined;
  await copyWikiReference({
    capture: usableCapture(ctx.bridgeCapture),
    place,
    noteText: note.text,
    json,
    clipboard: ctx.clipboard,
    inform: (message) => ctx.dialogs.inform(message),
    error: (message) => ctx.dialogs.error(message),
  });
}

async function showLayout(ctx: Context, state: WikiSession): Promise<void> {
  const uri = activeNote(ctx).uri;
  const place = uri ? placeFor(state.projects, uri) : undefined;
  const root =
    place?.project.rootUri ??
    (uri
      ? containingFolder(uri, asStrings(ctx.workspace.folders()))?.root
      : undefined);
  ctx.dialogs.inform(layoutSummary(place?.project, state.problems, root));
}

function activeNote(ctx: Context): { uri?: string; text?: string } {
  const panel = ctx.editors?.active();
  const uri =
    asString(panel?.document?.uri) ?? asString(ctx.activeEditor.note());
  const read = panel?.document?.getText;
  const text = typeof read === "function" ? read() : undefined;
  return {
    ...(uri ? { uri } : {}),
    ...(typeof text === "string" ? { text } : {}),
  };
}

function usableCapture(
  capture: BridgeCapture | undefined,
): BridgeCapture | undefined {
  if (!capture || typeof capture.markdownSelection !== "function") {
    return undefined;
  }
  return capture;
}
