import type {
  DiagnosticItem,
  IdeContextCaps,
  IdeContextPacket,
  PdfSelectionWire,
} from "./types";

const BUDGET_WARNING =
  "packet budget: truncated/omitted fields to satisfy maxJsonChars|maxClipboardChars";

const SEVERITY_RANK: Record<DiagnosticItem["severity"], number> = {
  hint: 0,
  information: 1,
  warning: 2,
  error: 3,
};

function truncateUri(uri: string, max: number): string {
  if (uri.length <= max) return uri;
  const schemeMatch = /^([a-z][a-z0-9+.-]*:\/\/)/i.exec(uri);
  const scheme = schemeMatch?.[1] ?? "";
  const tailBudget = Math.max(0, max - scheme.length);
  if (tailBudget <= 0) return uri.slice(0, max);
  return scheme + uri.slice(uri.length - tailBudget);
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function clonePacket(packet: IdeContextPacket): IdeContextPacket {
  return structuredClone(packet);
}

function jsonLen(packet: IdeContextPacket): number {
  return JSON.stringify(packet).length;
}

function pushBudgetWarning(warnings: string[], caps: IdeContextCaps): void {
  const msg = truncateStr(BUDGET_WARNING, caps.maxWarningChars);
  if (!warnings.includes(msg)) warnings.push(msg);
}

function applyPerStringCaps(packet: IdeContextPacket, caps: IdeContextCaps): boolean {
  let changed = false;

  if (packet.active) {
    const uri = truncateUri(packet.active.uri, caps.maxUriChars);
    if (uri !== packet.active.uri) {
      packet.active.uri = uri;
      changed = true;
    }
    if (packet.active.selection) {
      const text = truncateStr(packet.active.selection.text, caps.maxSelectedChars);
      if (text !== packet.active.selection.text) {
        packet.active.selection.text = text;
        packet.active.selection.truncated = true;
        changed = true;
      }
    }
  }

  packet.tabs.visible = packet.tabs.visible.map((u) => {
    const n = truncateUri(u, caps.maxUriChars);
    if (n !== u) changed = true;
    return n;
  });
  packet.tabs.open = packet.tabs.open.map((u) => {
    const n = truncateUri(u, caps.maxUriChars);
    if (n !== u) changed = true;
    return n;
  });
  if (packet.tabs.visible.length > caps.maxTabUris) {
    packet.tabs.visible = packet.tabs.visible.slice(0, caps.maxTabUris);
    packet.tabs.truncated = true;
    changed = true;
  }
  if (packet.tabs.open.length > caps.maxTabUris) {
    packet.tabs.open = packet.tabs.open.slice(0, caps.maxTabUris);
    packet.tabs.truncated = true;
    changed = true;
  }

  const diagUri = truncateUri(packet.diagnostics.uri, caps.maxUriChars);
  if (diagUri !== packet.diagnostics.uri) {
    packet.diagnostics.uri = diagUri;
    changed = true;
  }
  if (packet.diagnostics.items.length > caps.maxDiagnosticItems) {
    packet.diagnostics.items = packet.diagnostics.items.slice(0, caps.maxDiagnosticItems);
    packet.diagnostics.truncated = true;
    changed = true;
  }
  for (const item of packet.diagnostics.items) {
    const msg = truncateStr(item.message, caps.maxDiagnosticMessageChars);
    if (msg !== item.message) {
      item.message = msg;
      changed = true;
    }
    if (item.source !== undefined) {
      const s = truncateStr(item.source, caps.maxDiagnosticSourceChars);
      if (s !== item.source) {
        item.source = s;
        changed = true;
      }
    }
    if (typeof item.code === "string") {
      const c = truncateStr(item.code, caps.maxDiagnosticCodeChars);
      if (c !== item.code) {
        item.code = c;
        changed = true;
      }
    }
  }

  if (packet.workspace?.name !== undefined) {
    const n = truncateStr(packet.workspace.name, caps.maxWorkspaceNameChars);
    if (n !== packet.workspace.name) {
      packet.workspace.name = n;
      changed = true;
    }
  }

  if (packet.product === "pdfWorkshop") {
    const uri = truncateUri(packet.pdf.uri, caps.maxUriChars);
    if (uri !== packet.pdf.uri) {
      packet.pdf.uri = uri;
      changed = true;
    }
    if (packet.pdf.citeMarkdown !== undefined) {
      const c = truncateStr(packet.pdf.citeMarkdown, caps.maxCiteMarkdownChars);
      if (c !== packet.pdf.citeMarkdown) {
        packet.pdf.citeMarkdown = c;
        changed = true;
      }
    }
    packet.pdf.selection = truncatePdfSelection(packet.pdf.selection, caps, () => {
      changed = true;
    });
  }

  packet.warnings = packet.warnings.map((w) => truncateStr(w, caps.maxWarningChars));
  if (packet.warnings.length > caps.maxWarnings) {
    packet.warnings = packet.warnings.slice(-caps.maxWarnings);
    changed = true;
  }

  packet.caps = { ...caps };
  return changed;
}

function truncatePdfSelection(
  sel: PdfSelectionWire,
  caps: IdeContextCaps,
  mark: () => void,
): PdfSelectionWire {
  if (sel.kind === "none") return sel;
  if (sel.kind === "text") {
    let text = sel.text;
    let truncated = sel.truncated;
    if (text.length > caps.maxPdfSelectedChars) {
      text = text.slice(0, caps.maxPdfSelectedChars);
      truncated = true;
      mark();
    }
    let rects = sel.rects;
    let rectsTruncated = sel.rectsTruncated;
    if (rects && rects.length > caps.maxPdfSelectionRects) {
      rects = rects.slice(0, caps.maxPdfSelectionRects);
      rectsTruncated = true;
      mark();
    }
    return { kind: "text", text, truncated, rects, rectsTruncated };
  }
  // region
  let rects = sel.rects;
  let rectsTruncated = sel.rectsTruncated;
  if (rects.length > caps.maxPdfSelectionRects) {
    rects = rects.slice(0, caps.maxPdfSelectionRects);
    rectsTruncated = true;
    mark();
  }
  let regionImagePath = sel.regionImagePath;
  if (regionImagePath !== undefined && regionImagePath.length > caps.maxTempPathChars) {
    regionImagePath = truncateStr(regionImagePath, caps.maxTempPathChars);
    mark();
  }
  return { kind: "region", rects, rectsTruncated, regionImagePath };
}

function shrinkSelectionTexts(packet: IdeContextPacket, caps: IdeContextCaps): boolean {
  let changed = false;
  if (packet.active?.selection && packet.active.selection.text.length > 0) {
    // Further shrink toward 0 — for step 2 we may cut in half repeatedly;
    // callers invoke until under budget. Here: cut to half or empty.
    const cur = packet.active.selection.text;
    const nextLen = Math.floor(cur.length / 2);
    packet.active.selection.text = cur.slice(0, nextLen);
    packet.active.selection.truncated = true;
    changed = true;
  }
  if (
    packet.product === "pdfWorkshop" &&
    packet.pdf.selection.kind === "text" &&
    packet.pdf.selection.text.length > 0
  ) {
    const cur = packet.pdf.selection.text;
    const nextLen = Math.floor(cur.length / 2);
    packet.pdf.selection = {
      ...packet.pdf.selection,
      text: cur.slice(0, nextLen),
      truncated: true,
    };
    changed = true;
  }
  void caps;
  return changed;
}

function dropTrailingPdfRects(packet: IdeContextPacket): boolean {
  if (packet.product !== "pdfWorkshop") return false;
  const sel = packet.pdf.selection;
  if (sel.kind === "none" || !sel.rects || sel.rects.length === 0) return false;
  const minKeep = sel.kind === "region" ? 1 : 0;
  if (sel.rects.length <= minKeep) return false;
  const next = sel.rects.slice(0, sel.rects.length - 1);
  if (sel.kind === "text") {
    packet.pdf.selection = { ...sel, rects: next, rectsTruncated: true };
  } else {
    packet.pdf.selection = { ...sel, rects: next, rectsTruncated: true };
  }
  return true;
}

function dropLowestSeverityDiagnostic(packet: IdeContextPacket): boolean {
  const items = packet.diagnostics.items;
  if (items.length === 0) return false;
  let dropIdx = items.length - 1;
  let bestRank = SEVERITY_RANK[items[dropIdx]!.severity];
  for (let i = items.length - 1; i >= 0; i--) {
    const rank = SEVERITY_RANK[items[i]!.severity];
    if (rank < bestRank) {
      bestRank = rank;
      dropIdx = i;
    }
  }
  // Prefer dropping from the end within the same severity tier
  for (let i = items.length - 1; i >= 0; i--) {
    if (SEVERITY_RANK[items[i]!.severity] === bestRank) {
      dropIdx = i;
      break;
    }
  }
  items.splice(dropIdx, 1);
  packet.diagnostics.truncated = true;
  return true;
}

function dropTrailingTab(packet: IdeContextPacket, which: "open" | "visible"): boolean {
  const arr = packet.tabs[which];
  if (arr.length === 0) return false;
  arr.pop();
  packet.tabs.truncated = true;
  return true;
}

function omitOptionalFields(packet: IdeContextPacket): boolean {
  let changed = false;
  if (packet.product === "pdfWorkshop") {
    if (packet.pdf.citeMarkdown !== undefined) {
      delete packet.pdf.citeMarkdown;
      changed = true;
    }
    if (packet.pdf.selection.kind === "region" && packet.pdf.selection.regionImagePath !== undefined) {
      delete packet.pdf.selection.regionImagePath;
      changed = true;
    }
    if (packet.pdf.viewrect !== undefined) {
      delete packet.pdf.viewrect;
      changed = true;
    }
  }
  if (packet.workspace?.name !== undefined) {
    delete packet.workspace.name;
    changed = true;
  }
  return changed;
}

function omitCaretAndSelectionBodies(packet: IdeContextPacket): boolean {
  let changed = false;
  if (packet.active?.caret !== undefined) {
    delete packet.active.caret;
    changed = true;
  }
  if (packet.active?.selection !== undefined) {
    delete packet.active.selection;
    changed = true;
  }
  if (packet.product === "pdfWorkshop" && packet.pdf.selection.kind !== "none") {
    packet.pdf.selection = { kind: "none" };
    changed = true;
  }
  return changed;
}

function defaultJsonUnderBudget(packet: IdeContextPacket, caps: IdeContextCaps): boolean {
  // Default: field truncation must satisfy JSON cap; clipboard may supply its own predicate.
  return jsonLen(packet) <= caps.maxJsonChars;
}

export interface TruncateOptions {
  /** Replace the default JSON-length budget check (e.g. rendered Markdown length). */
  underBudget?: (packet: IdeContextPacket) => boolean;
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
  const isUnder = opts?.underBudget ?? ((p: IdeContextPacket) => defaultJsonUnderBudget(p, caps));

  const perStringChanged = applyPerStringCaps(out, caps);
  let budgetFired = perStringChanged && !isUnder(out);

  const steps: Array<() => boolean> = [
    () => shrinkSelectionTexts(out, caps),
    () => dropTrailingPdfRects(out),
    () => dropLowestSeverityDiagnostic(out),
    () => dropTrailingTab(out, "open"),
    () => dropTrailingTab(out, "visible"),
    () => omitOptionalFields(out),
    () => omitCaretAndSelectionBodies(out),
    () => {
      if (out.diagnostics.items.length === 0) return false;
      out.diagnostics.items = [];
      out.diagnostics.truncated = true;
      return true;
    },
  ];

  // Always ensure per-string applied; then loop priority until under budget
  // or no more shrinks possible. Selection text shrink may need multiple passes.
  let guard = 0;
  const shrinkUntilUnder = (): void => {
    while (!isUnder(out) && guard < 200) {
      guard++;
      let progressed = false;
      // Prefer repeatedly shrinking selection texts first (priority 2)
      if (shrinkSelectionTexts(out, caps)) {
        progressed = true;
        budgetFired = true;
        continue;
      }
      for (const step of steps.slice(1)) {
        if (step()) {
          progressed = true;
          budgetFired = true;
          break;
        }
      }
      if (!progressed) break;
    }
  };

  shrinkUntilUnder();

  // Also mark budget if per-string caps truncated selection texts (test expects warning)
  if (perStringChanged) {
    const selTrunc =
      out.active?.selection?.truncated === true ||
      (out.product === "pdfWorkshop" &&
        out.pdf.selection.kind === "text" &&
        out.pdf.selection.truncated);
    if (selTrunc) budgetFired = true;
  }

  if (budgetFired) pushBudgetWarning(out.warnings, caps);

  // Cap warnings last; keep budget warning
  const capWarnings = (): void => {
    if (out.warnings.length > caps.maxWarnings) {
      const budget = out.warnings.filter((w) => /budget|truncat/i.test(w));
      const others = out.warnings.filter((w) => !/budget|truncat/i.test(w));
      const keepOthers = others.slice(-(caps.maxWarnings - budget.length));
      out.warnings = [...keepOthers, ...budget].slice(-caps.maxWarnings);
    }
  };
  capWarnings();

  // Budget warning itself can push a just-under packet back over the predicate
  // (clipboard Markdown underBudget). Continue structured truncation with the
  // warning included until under budget or no further shrink is possible.
  // Keep md.slice only for a genuinely impossible minimum in renderMarkdown.
  shrinkUntilUnder();
  if (budgetFired) pushBudgetWarning(out.warnings, caps);
  capWarnings();

  return out;
}
