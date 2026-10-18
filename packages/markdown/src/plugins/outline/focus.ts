import { contributionId } from "../../shared/setting-schema";
import { VIEW_ID } from "./commands";

/** Built-in Explorer Outline view (`IOutlinePane.Id`). */
export const NATIVE_OUTLINE_ID = "outline";

/**
 * Tags lives in another plugin; use the shared contribution id so this module
 * does not import tags internals.
 */
export const TAGS_VIEW_ID = contributionId("tags");

/** Lumière custom editor view type. */
export const MARKDOWN_WORKSHOP_EDITOR = "lumiere.markdown.editor";

/** Lumière PDF custom editor view type (peer product). */
export const PDF_WORKSHOP_EDITOR = "lumiere.pdf.viewer";

/**
 * Delay before restoring the native Outline after leaving a Workshop editor.
 * A short window lets a Lumière PDF tab take over without flashing Outline.
 */
export const LEAVE_RESTORE_MS = 120;

export type OutlineFocusExecute = (command: string) => Promise<unknown>;

export type OutlineFocusSchedule = (
  run: () => void,
  ms: number,
) => { dispose: () => void };

export type OutlineFocusOptions = {
  execute: OutlineFocusExecute;
  /** Return keyboard focus to the editor after showing sidebar views. */
  focusEditor: () => Promise<unknown>;
  /**
   * Active tab's custom editor viewType, if any. Used to abort native Outline
   * restore when Markdown or Lumière PDF already owns the sidebar swap.
   */
  activeCustomEditorViewType?: () => string | undefined;
  /** This product's custom editor id (defaults to Lumière). */
  ownEditorViewType?: string;
  outlineViewId?: string;
  tagsViewId?: string;
  leaveDelayMs?: number;
  schedule?: OutlineFocusSchedule;
};

/** True when a Workshop custom editor (MW or PDF) is the active tab. */
export function workshopEditorOwnsOutline(
  viewType: string | undefined,
): boolean {
  return (
    viewType === MARKDOWN_WORKSHOP_EDITOR || viewType === PDF_WORKSHOP_EDITOR
  );
}

type FocusState = {
  engaged: boolean;
  leave: { dispose: () => void } | undefined;
};

/**
 * One-shot sidebar swap while a Lumière custom editor is active:
 * hide the native Outline, show Markdown Outline and Tags, then restore the
 * native Outline on leave (debounced for Workshop↔PDF handoffs).
 */
export function createOutlineFocus(options: OutlineFocusOptions): {
  sync: (workshopActive: boolean) => void;
  dispose: () => void;
} {
  const resolved = resolveOptions(options);
  const state: FocusState = { engaged: false, leave: undefined };
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task, task);
  };

  return {
    sync(workshopActive) {
      if (workshopActive) {
        enterFocus(state, resolved, enqueue);
        return;
      }
      scheduleLeave(state, resolved, enqueue);
    },
    dispose() {
      state.leave?.dispose();
      state.leave = undefined;
      if (!state.engaged) {
        return;
      }
      state.engaged = false;
      enqueue(async () => {
        await restoreNativeOutline(resolved, "dispose");
      });
    },
  };
}

type ResolvedFocus = {
  execute: OutlineFocusExecute;
  focusEditor: () => Promise<unknown>;
  activeViewType: () => string | undefined;
  ownEditorViewType: string;
  outlineViewId: string;
  tagsViewId: string;
  leaveDelayMs: number;
  schedule: OutlineFocusSchedule;
};

function resolveOptions(options: OutlineFocusOptions): ResolvedFocus {
  return {
    execute: options.execute,
    focusEditor: options.focusEditor,
    activeViewType: () => options.activeCustomEditorViewType?.(),
    ownEditorViewType: options.ownEditorViewType ?? MARKDOWN_WORKSHOP_EDITOR,
    outlineViewId: options.outlineViewId ?? VIEW_ID,
    tagsViewId: options.tagsViewId ?? TAGS_VIEW_ID,
    leaveDelayMs: options.leaveDelayMs ?? LEAVE_RESTORE_MS,
    schedule: options.schedule ?? defaultSchedule,
  };
}

function enterFocus(
  state: FocusState,
  options: ResolvedFocus,
  enqueue: (task: () => Promise<void>) => void,
): void {
  state.leave?.dispose();
  state.leave = undefined;
  if (state.engaged) {
    return;
  }
  state.engaged = true;
  enqueue(async () => {
    await options.execute(`${NATIVE_OUTLINE_ID}.removeView`);
    await options.execute(`${options.outlineViewId}.focus`);
    await options.execute(`${options.tagsViewId}.focus`);
    await options.focusEditor();
  });
}

function scheduleLeave(
  state: FocusState,
  options: ResolvedFocus,
  enqueue: (task: () => Promise<void>) => void,
): void {
  if (!state.engaged || state.leave) {
    return;
  }
  state.leave = options.schedule(() => {
    state.leave = undefined;
    if (!state.engaged) {
      return;
    }
    state.engaged = false;
    enqueue(async () => {
      await restoreNativeOutline(options, "leave");
    });
  }, options.leaveDelayMs);
}

async function restoreNativeOutline(
  options: ResolvedFocus,
  reason: "leave" | "dispose",
): Promise<void> {
  const active = options.activeViewType();
  if (reason === "leave" && workshopEditorOwnsOutline(active)) {
    // Peer (or this product again) owns the sidebar; do not undo their hide.
    return;
  }
  if (
    reason === "dispose" &&
    workshopEditorOwnsOutline(active) &&
    active !== options.ownEditorViewType
  ) {
    // Peer Workshop owns the swap; leave native Outline to them.
    return;
  }
  try {
    await options.execute(`${NATIVE_OUTLINE_ID}.focus`);
    if (reason === "leave") {
      await options.focusEditor();
    }
  } catch (error) {
    // Dispose runs from an effect cleanup; the queued restore can land after
    // the host context has already rejected further execute calls.
    if (reason === "dispose") {
      return;
    }
    throw error;
  }
}

function defaultSchedule(run: () => void, ms: number): { dispose: () => void } {
  const timer = setTimeout(run, ms);
  return {
    dispose() {
      clearTimeout(timer);
    },
  };
}
