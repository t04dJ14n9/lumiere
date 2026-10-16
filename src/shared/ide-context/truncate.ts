import type { IdeContextCaps, IdeContextPacket } from "./types";
import {
  applyPerStringCaps,
  dropLowestSeverityDiagnostic,
  dropTrailingPdfRects,
  dropTrailingTab,
  omitCaretAndSelectionBodies,
  omitOptionalFields,
  shrinkSelectionTexts,
} from "./truncate-fields";

const BUDGET_WARNING =
  "packet budget: truncated/omitted fields to satisfy maxJsonChars|maxClipboardChars";

function clonePacket(packet: IdeContextPacket): IdeContextPacket {
  return JSON.parse(JSON.stringify(packet)) as IdeContextPacket;
}

function jsonLen(packet: IdeContextPacket): number {
  return JSON.stringify(packet).length;
}

function pushBudgetWarning(warnings: string[], caps: IdeContextCaps): void {
  const msg =
    BUDGET_WARNING.length <= caps.maxWarningChars
      ? BUDGET_WARNING
      : BUDGET_WARNING.slice(0, caps.maxWarningChars);
  if (!warnings.includes(msg)) {
    warnings.push(msg);
  }
}

function defaultJsonUnderBudget(
  packet: IdeContextPacket,
  caps: IdeContextCaps,
): boolean {
  // Default: field truncation must satisfy JSON cap; clipboard may supply its own predicate.
  return jsonLen(packet) <= caps.maxJsonChars;
}

export interface TruncateOptions {
  /** Replace the default JSON-length budget check (e.g. rendered Markdown length). */
  underBudget?: (packet: IdeContextPacket) => boolean;
}

function buildTruncateSteps(
  out: IdeContextPacket,
  caps: IdeContextCaps,
): Array<() => boolean> {
  return [
    () => shrinkSelectionTexts(out, caps),
    () => dropTrailingPdfRects(out),
    () => dropLowestSeverityDiagnostic(out),
    () => dropTrailingTab(out, "open"),
    () => dropTrailingTab(out, "visible"),
    () => omitOptionalFields(out),
    () => omitCaretAndSelectionBodies(out),
    () => {
      if (out.diagnostics.items.length === 0) {
        return false;
      }
      out.diagnostics.items = [];
      out.diagnostics.truncated = true;
      return true;
    },
  ];
}

function selectionWasTruncated(out: IdeContextPacket): boolean {
  return (
    out.active?.selection?.truncated === true ||
    (out.product === "pdfWorkshop" &&
      out.pdf.selection.kind === "text" &&
      out.pdf.selection.truncated)
  );
}

function capWarningsList(out: IdeContextPacket, caps: IdeContextCaps): void {
  if (out.warnings.length <= caps.maxWarnings) {
    return;
  }
  const budget = out.warnings.filter((w) => /budget|truncat/i.test(w));
  const others = out.warnings.filter((w) => !/budget|truncat/i.test(w));
  const keepOthers = others.slice(-(caps.maxWarnings - budget.length));
  out.warnings = [...keepOthers, ...budget].slice(-caps.maxWarnings);
}

/**
 * Field-level truncate before serialize. Mutates a copy; appends budget warnings.
 * Priority: selections → rects → diagnostics → open tabs → visible tabs → optionals.
 */
export function truncatePacket(
  packet: IdeContextPacket,
  caps: IdeContextCaps = packet.caps,
  opts?: TruncateOptions,
): IdeContextPacket {
  const out = clonePacket(packet);
  out.caps = { ...caps };
  const isUnder =
    opts?.underBudget ??
    ((p: IdeContextPacket) => defaultJsonUnderBudget(p, caps));

  const perStringChanged = applyPerStringCaps(out, caps);
  let budgetFired = perStringChanged && !isUnder(out);
  const steps = buildTruncateSteps(out, caps);

  // Always ensure per-string applied; then loop priority until under budget
  // or no more shrinks possible. Selection text shrink may need multiple passes.
  let guard = 0;
  const shrinkUntilUnder = (): void => {
    while (!isUnder(out) && guard < 200) {
      guard++;
      // Prefer repeatedly shrinking selection texts first (priority 2)
      if (shrinkSelectionTexts(out, caps)) {
        budgetFired = true;
        continue;
      }
      let progressed = false;
      for (const step of steps.slice(1)) {
        if (step()) {
          progressed = true;
          budgetFired = true;
          break;
        }
      }
      if (!progressed) {
        break;
      }
    }
  };

  shrinkUntilUnder();

  // Also mark budget if per-string caps truncated selection texts (test expects warning)
  if (perStringChanged && selectionWasTruncated(out)) {
    budgetFired = true;
  }

  if (budgetFired) {
    pushBudgetWarning(out.warnings, caps);
  }
  capWarningsList(out, caps);

  // Budget warning itself can push a just-under packet back over the predicate
  // (clipboard Markdown underBudget). Continue structured truncation with the
  // warning included until under budget or no further shrink is possible.
  // Keep md.slice only for a genuinely impossible minimum in renderMarkdown.
  shrinkUntilUnder();
  if (budgetFired) {
    pushBudgetWarning(out.warnings, caps);
  }
  capWarningsList(out, caps);

  return out;
}
