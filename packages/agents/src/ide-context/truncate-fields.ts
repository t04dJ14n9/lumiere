import type {
  DiagnosticItem,
  IdeContextCaps,
  IdeContextPacket,
  PdfSelectionWire,
} from "./types";

const SEVERITY_RANK: Record<DiagnosticItem["severity"], number> = {
  hint: 0,
  information: 1,
  warning: 2,
  error: 3,
};

function truncateUri(uri: string, max: number): string {
  if (uri.length <= max) {
    return uri;
  }
  const schemeMatch = /^([a-z][a-z0-9+.-]*:\/\/)/i.exec(uri);
  const scheme = schemeMatch?.[1] ?? "";
  const tailBudget = Math.max(0, max - scheme.length);
  if (tailBudget <= 0) {
    return uri.slice(0, max);
  }
  return scheme + uri.slice(uri.length - tailBudget);
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function capActiveFields(
  packet: IdeContextPacket,
  caps: IdeContextCaps,
): boolean {
  let changed = false;
  if (!packet.active) {
    return false;
  }
  const uri = truncateUri(packet.active.uri, caps.maxUriChars);
  if (uri !== packet.active.uri) {
    packet.active.uri = uri;
    changed = true;
  }
  if (packet.active.selection) {
    const text = truncateStr(
      packet.active.selection.text,
      caps.maxSelectedChars,
    );
    if (text !== packet.active.selection.text) {
      packet.active.selection.text = text;
      packet.active.selection.truncated = true;
      changed = true;
    }
  }
  return changed;
}

function capTabFields(packet: IdeContextPacket, caps: IdeContextCaps): boolean {
  let changed = false;
  packet.tabs.visible = packet.tabs.visible.map((u) => {
    const n = truncateUri(u, caps.maxUriChars);
    if (n !== u) {
      changed = true;
    }
    return n;
  });
  packet.tabs.open = packet.tabs.open.map((u) => {
    const n = truncateUri(u, caps.maxUriChars);
    if (n !== u) {
      changed = true;
    }
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
  return changed;
}

function capDiagnosticFields(
  packet: IdeContextPacket,
  caps: IdeContextCaps,
): boolean {
  let changed = false;
  const diagUri = truncateUri(packet.diagnostics.uri, caps.maxUriChars);
  if (diagUri !== packet.diagnostics.uri) {
    packet.diagnostics.uri = diagUri;
    changed = true;
  }
  if (packet.diagnostics.items.length > caps.maxDiagnosticItems) {
    packet.diagnostics.items = packet.diagnostics.items.slice(
      0,
      caps.maxDiagnosticItems,
    );
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
  return changed;
}

function capPdfAndWorkspaceFields(
  packet: IdeContextPacket,
  caps: IdeContextCaps,
): boolean {
  let changed = false;
  if (packet.workspace?.name !== undefined) {
    const n = truncateStr(packet.workspace.name, caps.maxWorkspaceNameChars);
    if (n !== packet.workspace.name) {
      packet.workspace.name = n;
      changed = true;
    }
  }
  if (packet.product !== "pdfWorkshop") {
    return changed;
  }
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
  packet.pdf.selection = truncatePdfSelection(
    packet.pdf.selection,
    caps,
    () => {
      changed = true;
    },
  );
  return changed;
}

export function applyPerStringCaps(
  packet: IdeContextPacket,
  caps: IdeContextCaps,
): boolean {
  let changed = false;
  if (capActiveFields(packet, caps)) {
    changed = true;
  }
  if (capTabFields(packet, caps)) {
    changed = true;
  }
  if (capDiagnosticFields(packet, caps)) {
    changed = true;
  }
  if (capPdfAndWorkspaceFields(packet, caps)) {
    changed = true;
  }

  packet.warnings = packet.warnings.map((w) =>
    truncateStr(w, caps.maxWarningChars),
  );
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
  if (sel.kind === "none") {
    return sel;
  }
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
    const out: PdfSelectionWire = { kind: "text", text, truncated };
    if (rects !== undefined) {
      out.rects = rects;
    }
    if (rectsTruncated !== undefined) {
      out.rectsTruncated = rectsTruncated;
    }
    return out;
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
  if (
    regionImagePath !== undefined &&
    regionImagePath.length > caps.maxTempPathChars
  ) {
    regionImagePath = truncateStr(regionImagePath, caps.maxTempPathChars);
    mark();
  }
  const out: PdfSelectionWire = { kind: "region", rects, rectsTruncated };
  if (regionImagePath !== undefined) {
    out.regionImagePath = regionImagePath;
  }
  return out;
}

export function shrinkSelectionTexts(
  packet: IdeContextPacket,
  caps: IdeContextCaps,
): boolean {
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

export function dropTrailingPdfRects(packet: IdeContextPacket): boolean {
  if (packet.product !== "pdfWorkshop") {
    return false;
  }
  const sel = packet.pdf.selection;
  if (sel.kind === "none" || !sel.rects || sel.rects.length === 0) {
    return false;
  }
  const minKeep = sel.kind === "region" ? 1 : 0;
  if (sel.rects.length <= minKeep) {
    return false;
  }
  const next = sel.rects.slice(0, sel.rects.length - 1);
  if (sel.kind === "text") {
    packet.pdf.selection = { ...sel, rects: next, rectsTruncated: true };
  } else {
    packet.pdf.selection = { ...sel, rects: next, rectsTruncated: true };
  }
  return true;
}

export function dropLowestSeverityDiagnostic(
  packet: IdeContextPacket,
): boolean {
  const items = packet.diagnostics.items;
  if (items.length === 0) {
    return false;
  }
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

export function dropTrailingTab(
  packet: IdeContextPacket,
  which: "open" | "visible",
): boolean {
  const arr = packet.tabs[which];
  if (arr.length === 0) {
    return false;
  }
  arr.pop();
  packet.tabs.truncated = true;
  return true;
}

export function omitOptionalFields(packet: IdeContextPacket): boolean {
  let changed = false;
  if (packet.product === "pdfWorkshop") {
    if (packet.pdf.citeMarkdown !== undefined) {
      delete packet.pdf.citeMarkdown;
      changed = true;
    }
    if (
      packet.pdf.selection.kind === "region" &&
      packet.pdf.selection.regionImagePath !== undefined
    ) {
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

export function omitCaretAndSelectionBodies(packet: IdeContextPacket): boolean {
  let changed = false;
  if (packet.active?.caret !== undefined) {
    delete packet.active.caret;
    changed = true;
  }
  if (packet.active?.selection !== undefined) {
    delete packet.active.selection;
    changed = true;
  }
  if (
    packet.product === "pdfWorkshop" &&
    packet.pdf.selection.kind !== "none"
  ) {
    packet.pdf.selection = { kind: "none" };
    changed = true;
  }
  return changed;
}
