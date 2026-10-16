import { contributionId } from "../../shared/setting-schema";
import { VIEW_ID } from "./commands";

/** Built-in Explorer Outline view (`IOutlinePane.Id`). */
export const NATIVE_OUTLINE_ID = "outline";

/**
 * Tags lives in another plugin; use the shared contribution id so this module
 * does not import tags internals.
 */
export const TAGS_VIEW_ID = contributionId("tags");

/**
 * Delay before restoring the native Outline after leaving a Workshop editor.
 * A short window lets a PDF Workshop tab take over without flashing Outline.
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
  outlineViewId?: string;
  tagsViewId?: string;
  leaveDelayMs?: number;
  schedule?: OutlineFocusSchedule;
};

/**
 * One-shot sidebar swap while a Markdown Workshop custom editor is active:
 * hide the native Outline, show Markdown Outline and Tags, then restore the
 * native Outline on leave (debounced for Workshop↔PDF handoffs).
 */
export function createOutlineFocus(options: OutlineFocusOptions): {
  sync: (workshopActive: boolean) => void;
  dispose: () => void;
} {
  const outlineViewId = options.outlineViewId ?? VIEW_ID;
  const tagsViewId = options.tagsViewId ?? TAGS_VIEW_ID;
  const leaveDelayMs = options.leaveDelayMs ?? LEAVE_RESTORE_MS;
  const schedule = options.schedule ?? defaultSchedule;
  let engaged = false;
  let leave: { dispose: () => void } | undefined;
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task, task);
  };

  const enter = (): void => {
    leave?.dispose();
    leave = undefined;
    if (engaged) {
      return;
    }
    engaged = true;
    enqueue(async () => {
      await options.execute(`${NATIVE_OUTLINE_ID}.removeView`);
      await options.execute(`${outlineViewId}.focus`);
      await options.execute(`${tagsViewId}.focus`);
      await options.focusEditor();
    });
  };

  const leaveNow = (): void => {
    if (!engaged) {
      return;
    }
    engaged = false;
    enqueue(async () => {
      // Always restore native Outline after we hid it on enter. Modern VS Code
      // makes removeView idempotent when already hidden; we cannot read prior
      // visibility without private APIs, so leave re-shows Outline for code
      // files. Our Outline/Tags use when-clauses and drop out of the Explorer
      // when the Workshop editor is inactive.
      await options.execute(`${NATIVE_OUTLINE_ID}.focus`);
      await options.focusEditor();
    });
  };

  return {
    sync(workshopActive) {
      if (workshopActive) {
        enter();
        return;
      }
      if (!engaged || leave) {
        return;
      }
      leave = schedule(() => {
        leave = undefined;
        leaveNow();
      }, leaveDelayMs);
    },
    dispose() {
      leave?.dispose();
      leave = undefined;
      engaged = false;
    },
  };
}

function defaultSchedule(run: () => void, ms: number): { dispose: () => void } {
  const timer = setTimeout(run, ms);
  return {
    dispose() {
      clearTimeout(timer);
    },
  };
}
