import { ViewPlugin, type EditorView } from "@codemirror/view";
import { getCM, type CodeMirror, type Pos } from "@replit/codemirror-vim";
import type { LivePreview } from "../livePreview/api";
import { tableMotionPosition } from "./source-motion";
import { observeMotionContext } from "./motion-context";

/** Keep Vim's command bookkeeping while correcting rendered block targets. */
export function revealBlockMotion(service: () => LivePreview | undefined) {
  return ViewPlugin.define((view) => {
    const cm = getCM(view);
    return cm ? installBlockMotion(view, cm, service) : {};
  });
}

export function installBlockMotion(
  view: EditorView,
  cm: CodeMirror,
  service: () => LivePreview | undefined,
) {
  const original = cm.findPosV;
  const context = observeMotionContext(cm);
  let entering = false;
  const keydown = (event: KeyboardEvent) => {
    // Vim clears inputState before findPosV; capture operators before its handler.
    entering = canRevealBlock(event, cm.state.vim);
  };
  cm.findPosV = (start, amount, unit, goalColumn) => {
    const policy = context.consume();
    const eligible = entering;
    entering = false;
    const result = original.call(cm, start, amount, unit, goalColumn);
    const preview = service();
    if (unit !== "line" || preview?.mode !== "livePreview") {
      return result;
    }
    const source = policy
      ? tableSourcePosition(view, preview, {
          start,
          amount,
          result,
          goalColumn:
            policy === "source"
              ? (cm.state.vim?.lastHPos ?? start.ch)
              : result.ch,
          policy,
        })
      : undefined;
    if (source) {
      return source;
    }
    if (eligible && Math.abs(amount) === 1) {
      return revealPosition(view, preview, amount) ?? result;
    }
    return result;
  };
  view.contentDOM.addEventListener("keydown", keydown, true);
  view.contentDOM.addEventListener("keyup", keydown, true);
  return {
    destroy() {
      view.contentDOM.removeEventListener("keydown", keydown, true);
      view.contentDOM.removeEventListener("keyup", keydown, true);
      cm.findPosV = original;
      context.destroy();
    },
  };
}

function canRevealBlock(
  event: KeyboardEvent,
  mode: CodeMirror["state"]["vim"],
): boolean {
  return Boolean(
    event.type === "keydown" &&
    ["j", "k"].includes(event.key) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    mode &&
    !mode.insertMode &&
    !mode.visualMode &&
    !mode.inputState.operator,
  );
}

function tableSourcePosition(
  view: EditorView,
  preview: LivePreview,
  motion: {
    start: Pos;
    amount: number;
    result: Pos;
    goalColumn: number;
    policy: "source" | "display-entry";
  },
): Pos | undefined {
  const { doc } = view.state;
  const fromLine = Math.max(0, Math.min(motion.start.line, motion.result.line));
  const toLine = Math.min(
    doc.lines - 1,
    Math.max(motion.start.line, motion.result.line),
  );
  const widgets =
    preview.renderedWidgets?.(
      view.state,
      doc.line(fromLine + 1).from,
      doc.line(toLine + 1).to,
    ) ?? [];
  return tableMotionPosition({
    ...motion,
    lastLine: doc.lines - 1,
    lineLength: (line) => doc.line(line + 1).length,
    widgets: widgets.map((block) => ({
      kind: block.kind,
      from: doc.lineAt(block.from).number - 1,
      to: doc.lineAt(block.to).number - 1,
    })),
    folds: (preview.foldedRanges?.(view.state) ?? []).map((range) => ({
      from: doc.lineAt(range.from).number - 1,
      to: doc.lineAt(range.to).number - 1,
    })),
  });
}

function revealPosition(
  view: EditorView,
  preview: LivePreview,
  amount: number,
): Pos | undefined {
  const { doc } = view.state;
  const direction = amount > 0 ? 1 : -1;
  const next = doc.lineAt(view.state.selection.main.head).number + direction;
  if (next < 1 || next > doc.lines) {
    return undefined;
  }
  const line = doc.line(next);
  if (
    preview
      .renderedWidgets?.(view.state, line.from, line.to)
      .some((block) => block.kind === "Table")
  ) {
    return undefined;
  }
  const target = preview.verticalPosition?.(view.state, direction);
  if (target === undefined) {
    return undefined;
  }
  const targetLine = doc.lineAt(target);
  return { line: targetLine.number - 1, ch: target - targetLine.from };
}
