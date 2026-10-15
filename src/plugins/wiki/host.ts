import type { Context, Disposer, Plugin } from "../../kernel";
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
  inject: { required: ["workshop"], optional: ["editors", "bridgeCapture"] },
  apply(ctx) {
    const views = ctx.workshop.views;
    if (!views) {
      return;
    }
    const state: WikiSession = { projects: [], problems: [], generation: 0 };
    const reload = () => reloadWiki(ctx, state);
    ctx.provide("wikiLayout", layoutService(state, reload));
    const effect = (setup: () => Disposer) => {
      ctx.effect(setup);
    };
    const report = (message: string) => {
      if (ctx.isLive) {
        ctx.workshop.error(message);
      }
    };
    registerReportedCommands(effect, views, report, [
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
  const views = ctx.workshop.views;
  if (!views) {
    return;
  }
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
  ctx.effect(() => views.onActiveNoteChanged(schedule));
  ctx.effect(() => ctx.workshop.onChange(schedule));
  ctx.effect(() => ctx.workshop.onSave(schedule));
  // Captured while live: teardown runs after this context is disposed.
  const diagnostics = ctx.workshop.diagnostics;
  ctx.effect(() => () => {
    clearTimeout(timer);
    diagnostics?.clear("wiki");
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
    clipboard: ctx.workshop.clipboard,
    inform: (message) => ctx.workshop.inform?.(message),
    error: (message) => ctx.workshop.error(message),
  });
}

async function showLayout(ctx: Context, state: WikiSession): Promise<void> {
  const uri = activeNote(ctx).uri;
  const place = uri ? placeFor(state.projects, uri) : undefined;
  const root =
    place?.project.rootUri ??
    (uri
      ? containingFolder(uri, asStrings(ctx.workshop.workspaceFolders?.()))
          ?.root
      : undefined);
  ctx.workshop.inform?.(layoutSummary(place?.project, state.problems, root));
}

function activeNote(ctx: Context): { uri?: string; text?: string } {
  const panel = ctx.editors?.active();
  const uri =
    asString(panel?.document?.uri) ??
    asString(ctx.workshop.views?.activeNote());
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
