/** Built-in Explorer Outline view (`IOutlinePane.Id`). */
export const NATIVE_OUTLINE_ID = "outline";

export const PDF_OUTLINE_VIEW_ID = "lumiere.pdf.outline";

/** Lumière PDF custom editor view type. */
export const PDF_WORKSHOP_EDITOR = "lumiere.pdf.viewer";

/** Lumière custom editor view type (peer product). */
export const MARKDOWN_WORKSHOP_EDITOR = "lumiere.markdown.editor";

/**
 * Delay before restoring the native Outline after leaving a Lumière PDF
 * editor. Lets a Lumière tab take over without flashing Outline.
 */
export const LEAVE_RESTORE_MS = 120;

export type OutlineFocusExecute = (command: string) => Thenable<unknown>;

export type OutlineFocusSchedule = (
  run: () => void,
  ms: number,
) => { dispose: () => void };

export type OutlineFocusOptions = {
  execute: OutlineFocusExecute;
  focusEditor: () => Thenable<unknown>;
  /**
   * Active tab's custom editor viewType, if any. Used to abort native Outline
   * restore when Markdown or Lumière PDF already owns the sidebar swap.
   */
  activeCustomEditorViewType?: () => string | undefined;
  /** This product's custom editor id (defaults to Lumière PDF). */
  ownEditorViewType?: string;
  outlineViewId?: string;
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

type ResolvedFocus = {
  execute: OutlineFocusExecute;
  focusEditor: () => Thenable<unknown>;
  activeViewType: () => string | undefined;
  ownEditorViewType: string;
  outlineViewId: string;
  leaveDelayMs: number;
  schedule: OutlineFocusSchedule;
};

/**
 * One-shot sidebar swap while a Lumière PDF custom editor is active: hide the
 * native Outline, show PDF Outline, then restore native Outline on leave
 * (debounced for Workshop↔Markdown handoffs).
 */
export function createOutlineFocus(options: OutlineFocusOptions): {
  sync: (pdfActive: boolean) => void;
  dispose: () => void;
} {
  const resolved = resolveOptions(options);
  const state: FocusState = { engaged: false, leave: undefined };
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task, task);
  };

  return {
    sync(pdfActive) {
      if (pdfActive) {
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

function resolveOptions(options: OutlineFocusOptions): ResolvedFocus {
  return {
    execute: options.execute,
    focusEditor: options.focusEditor,
    activeViewType: () => options.activeCustomEditorViewType?.(),
    ownEditorViewType: options.ownEditorViewType ?? PDF_WORKSHOP_EDITOR,
    outlineViewId: options.outlineViewId ?? PDF_OUTLINE_VIEW_ID,
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
    return;
  }
  if (
    reason === "dispose" &&
    workshopEditorOwnsOutline(active) &&
    active !== options.ownEditorViewType
  ) {
    return;
  }
  await options.execute(`${NATIVE_OUTLINE_ID}.focus`);
  if (reason === "leave") {
    await options.focusEditor();
  }
}

function defaultSchedule(run: () => void, ms: number): { dispose: () => void } {
  const timer = setTimeout(run, ms);
  return { dispose: () => clearTimeout(timer) };
}
