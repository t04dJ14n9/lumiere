import { restoredZoomReady } from "../shared/restored-zoom";
import { useEffect, useRef, useState } from "react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import type { HostMessage } from "../shared/messages";
import type { ReadingPosition } from "../shared/reading-position";
import { samePosition } from "../shared/pdf-history";
import type { ViewChoices } from "../shared/view-settings";
import { postToHost } from "./host";
import type { Navigation } from "./navigation";
import { DOCUMENT_ID } from "./plugins";
import { nativeZoom, rememberedPosition } from "./reading-position";

import type {
  Dependencies,
  PendingJump,
  Replay,
  Zoom,
} from "./jump-history-types";

/** Frames a jump or replay may take before it is given up. */
const MAX_FRAMES = 180;
/** Frames the position must stay the same to count as settled. */
const STEADY_FRAMES = 4;

/** The viewer reports discrete jumps; the authoritative stack lives in the host. */
export function useJumpHistory(
  navigation: Navigation,
  choices: ViewChoices,
  setChoices: (choices: ViewChoices) => void,
) {
  const { provides: zoom } = useZoom(DOCUMENT_ID);
  const [state, setState] = useState({ back: false, forward: false });
  const controller = useRef<JumpHistoryController | undefined>(undefined);
  controller.current ??= new JumpHistoryController(setState);
  const history = controller.current;
  history.dependencies = { navigation, choices, setChoices, zoom };
  useEffect(() => () => history.dispose(), [history]);
  return {
    jump: history.jump,
    preview: history.preview,
    endPreview: history.endPreview,
    handle: history.handle,
    back: state.back,
    forward: state.forward,
    onBack: () => history.traverse("back"),
    onForward: () => history.traverse("forward"),
  };
}

/**
 * Turns deliberate jumps (links, page numbers, search results) into history
 * entries for the host, and replays the host's Back and Forward. Its methods
 * are bound once, so the hook hands out stable callbacks.
 */
class JumpHistoryController {
  dependencies!: Dependencies;
  private sequence = 0;
  private startedToken = 0;
  private frame: number | undefined;
  private pending: PendingJump | undefined;
  private previewOrigin:
    { position: ReadingPosition; readerRevision: number } | undefined;
  private replay: Replay | undefined;

  constructor(
    private readonly setState: (state: {
      back: boolean;
      forward: boolean;
    }) => void,
  ) {}

  private get intent() {
    return this.dependencies.navigation.intent;
  }

  /** Where the reader is now. */
  readonly snapshot = (): ReadingPosition =>
    readingSnapshot(this.dependencies.choices, this.dependencies.zoom);

  /** A search result shown before it is accepted: Back returns to before it. */
  readonly preview = (run: () => void): void => {
    this.finishJump();
    this.cancelReplay();
    const intent = this.intent;
    if (this.previewOrigin?.readerRevision !== intent.readerRevision()) {
      this.previewOrigin = {
        position: this.snapshot(),
        readerRevision: intent.readerRevision(),
      };
    }
    intent.advance();
    run();
  };

  readonly endPreview = (): void => {
    this.previewOrigin = undefined;
  };

  /** Run a deliberate move and record it once the viewport settles. */
  readonly jump = (
    run: () => void,
    requestId?: number,
    acceptPreview = false,
    expectedIntent?: number,
  ): void => {
    if (expectedIntent !== undefined && !this.intent.owns(expectedIntent)) {
      if (requestId !== undefined) {
        this.reportRestored(requestId, this.intent.current(), false);
      }
      return;
    }
    this.finishJump();
    this.cancelReplay();
    const intent = this.intent;
    const from =
      acceptPreview &&
      this.previewOrigin?.readerRevision === intent.readerRevision()
        ? this.previewOrigin.position
        : this.snapshot();
    this.previewOrigin = undefined;
    const generation = intent.advance();
    this.pending = {
      from,
      id: ++this.sequence,
      ...(requestId === undefined ? {} : { requestId }),
      ...(expectedIntent === undefined
        ? {}
        : { acknowledge: true, generation }),
    };
    run();
    this.settleJump(generation);
  };

  /** Messages about history from the host; false for any other message. */
  readonly handle = (message: Exclude<HostMessage, { type: "load" }>) => {
    switch (message.type) {
      case "historyState":
        this.setState({ back: message.back, forward: message.forward });
        return true;
      case "historyCancel":
        this.onCancel(message.token);
        return true;
      case "historyCapture":
        this.onCapture(message.token);
        return true;
      case "historyRestore":
        this.onRestore(message);
        return true;
      default:
        return false;
    }
  };

  traverse(direction: "back" | "forward"): void {
    this.finishJump();
    postToHost({ type: "historyTraverse", direction });
  }

  dispose(): void {
    this.intent.advance();
    this.clearFrame();
    this.pending = undefined;
    this.previewOrigin = undefined;
    this.replay = undefined;
  }

  /** Wait, frame by frame, until the jump's destination stops moving. */
  private settleJump(generation: number): void {
    const intent = this.intent;
    let previous = this.snapshot();
    let steady = 0;
    let frames = 0;
    const settle = (): void => {
      if (!this.pending) {
        return;
      }
      const position = this.snapshot();
      steady = samePosition(previous, position) ? steady + 1 : 0;
      previous = position;
      frames++;
      const settled =
        this.dependencies.navigation.isReady() &&
        frames > 6 &&
        steady >= STEADY_FRAMES;
      if (!intent.owns(generation) || settled || frames >= MAX_FRAMES) {
        this.finishJump(settled && intent.owns(generation));
        return;
      }
      this.frame = requestAnimationFrame(settle);
    };
    this.frame = requestAnimationFrame(settle);
  }

  /** Record the pending jump (and acknowledge a precise link's arrival). */
  private finishJump(applied = false): void {
    const jump = this.pending;
    if (!jump) {
      return;
    }
    this.pending = undefined;
    this.clearFrame();
    const { acknowledge, generation, ...entry } = jump;
    postToHost({ type: "historyJump", ...entry, to: this.snapshot() });
    if (acknowledge && entry.requestId !== undefined) {
      const intent = this.intent;
      this.reportRestored(
        entry.requestId,
        intent.current(),
        applied && generation !== undefined && intent.owns(generation),
      );
    }
  }

  private onCancel(token: number | undefined): void {
    if (token !== undefined && this.replay?.token !== token) {
      return;
    }
    this.previewOrigin = undefined;
    this.intent.advance();
    this.cancelReplay();
  }

  private onCapture(token: number): void {
    this.finishJump();
    this.previewOrigin = undefined;
    postToHost({
      type: "historyCaptured",
      token,
      startedToken: this.startedToken,
      position: this.snapshot(),
      intent: this.intent.current(),
      ok: true,
    });
  }

  private onRestore(
    message: Extract<HostMessage, { type: "historyRestore" }>,
  ): void {
    // Input can occur during capture -> host -> restore IPC, before a local
    // restoration loop even exists. Never revive that stale request.
    if (!this.intent.owns(message.expectedIntent)) {
      this.reportRestored(message.token, this.intent.current(), false);
      return;
    }
    this.finishJump();
    this.cancelReplay();
    this.previewOrigin = undefined;
    const requested = message.position;
    this.replay = {
      token: message.token,
      requested,
      generation: this.intent.advance(),
      frames: 0,
      steady: 0,
      positioned: false,
      previous: this.snapshot(),
    };
    this.startedToken = message.token;
    this.dependencies.setChoices({
      pageLayout: requested.pageLayout,
      scrollMode: requested.scrollMode,
      scrollDirection: requested.scrollDirection,
    });
    const replay = this.replay;
    const step = (): void => {
      if (this.replay === replay && this.replayStep(replay)) {
        this.frame = requestAnimationFrame(step);
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  /**
   * One frame of a replay: zoom first, then the layout, then the position;
   * done once it holds still. Returns whether to run another frame.
   */
  private replayStep(replay: Replay): boolean {
    if (!this.intent.owns(replay.generation) || ++replay.frames > MAX_FRAMES) {
      this.cancelReplay();
      return false;
    }
    const { navigation, zoom } = this.dependencies;
    if (!navigation.isReady() || !zoom || navigation.pageCount < 1) {
      return true;
    }
    const position = {
      ...replay.requested,
      page: Math.min(replay.requested.page, navigation.pageCount),
    };
    const native = nativeZoom(position.zoom);
    if (!zoomReady(zoom, native, navigation.isReady())) {
      // Check ownership immediately before every deferred viewport mutation.
      if (this.intent.owns(replay.generation)) {
        zoom.requestZoom(native);
      }
      replay.steady = 0;
    } else if (!replay.positioned) {
      this.positionReplay(replay, position);
    } else if (this.replaySettled(replay)) {
      return false;
    }
    return true;
  }

  /** Move to the replayed position once the layout matches and zoom held. */
  private positionReplay(replay: Replay, position: ReadingPosition): void {
    if (
      !sameChoices(this.dependencies.choices, position) ||
      replay.frames < 3
    ) {
      return;
    }
    if (this.intent.owns(replay.generation)) {
      this.dependencies.navigation.restore(position);
      // Position restoration supersedes zoom's deferred anchor correction.
      replay.generation = this.intent.current();
    }
    replay.positioned = true;
    replay.steady = 0;
  }

  /** Whether the replay's arrival has held still; then it is reported. */
  private replaySettled(replay: Replay): boolean {
    const actual = this.snapshot();
    replay.steady = samePosition(replay.previous, actual)
      ? replay.steady + 1
      : 0;
    replay.previous = actual;
    if (replay.steady < STEADY_FRAMES) {
      return false;
    }
    this.replay = undefined;
    this.frame = undefined;
    postToHost({
      type: "historyRestored",
      token: replay.token,
      position: actual,
      intent: replay.generation,
      ok: true,
    });
    return true;
  }

  private cancelReplay(): void {
    const replay = this.replay;
    if (!replay) {
      return;
    }
    this.replay = undefined;
    this.clearFrame();
    this.reportRestored(replay.token, this.intent.current(), false);
  }

  private reportRestored(token: number, intent: number, ok: boolean): void {
    postToHost({
      type: "historyRestored",
      token,
      position: this.snapshot(),
      intent,
      ok,
    });
  }

  private clearFrame(): void {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
    }
    this.frame = undefined;
  }
}

function zoomReady(
  zoom: NonNullable<Zoom>,
  native: ReturnType<typeof nativeZoom>,
  ready: boolean,
): boolean {
  const current = zoom.getState();
  return typeof native === "number"
    ? restoredZoomReady(
        ready,
        current.zoomLevel,
        current.currentZoomLevel,
        native,
      )
    : current.zoomLevel === native;
}

function sameChoices(choices: ViewChoices, position: ReadingPosition): boolean {
  return (
    choices.pageLayout === position.pageLayout &&
    choices.scrollMode === position.scrollMode &&
    choices.scrollDirection === position.scrollDirection
  );
}

/** The reading position: the remembered choices, the zoom and the first page on screen. */
function readingSnapshot(choices: ViewChoices, zoom: Zoom): ReadingPosition {
  const result = { ...rememberedPosition(), ...choices };
  const zoomState = zoom?.getState();
  if (zoomState) {
    result.zoom = zoomChoice(zoomState);
  }
  const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
  const page = viewport && firstVisiblePage(viewport);
  if (page && viewport) {
    const box = page.getBoundingClientRect();
    const scale = Number(page.dataset.scale);
    result.page = Number(page.dataset.pageIndex) + 1;
    result.top = Math.max(0, viewport.top - box.top) / scale;
    result.left = Math.max(0, viewport.left - box.left) / scale;
  }
  return result;
}

function zoomChoice(state: {
  zoomLevel: unknown;
  currentZoomLevel: number;
}): ReadingPosition["zoom"] {
  if (state.zoomLevel === ZoomMode.FitWidth) {
    return "fitWidth";
  }
  return state.zoomLevel === ZoomMode.FitPage
    ? "fitPage"
    : state.currentZoomLevel * 100;
}

/** The first rendered page that shows in the viewport. */
function firstVisiblePage(viewport: DOMRect): HTMLElement | undefined {
  for (const page of document.querySelectorAll<HTMLElement>(
    ".page[data-page-index]",
  )) {
    const box = page.getBoundingClientRect();
    const visible =
      box.bottom > viewport.top &&
      box.top < viewport.bottom &&
      box.right > viewport.left &&
      box.left < viewport.right;
    if (visible && Number(page.dataset.scale) > 0) {
      return page;
    }
  }
  return undefined;
}
