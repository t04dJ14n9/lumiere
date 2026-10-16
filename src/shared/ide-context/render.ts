import { scrubPacket } from "./scrub";
import { truncatePacket } from "./truncate";
import type { IdeContextPacket } from "./types";

function prepare(packet: IdeContextPacket): IdeContextPacket {
  // NORMATIVE pipeline: scrubPacket → truncatePacket → encode
  return truncatePacket(scrubPacket(packet), packet.caps);
}

function renderBody(packet: IdeContextPacket): string {
  const lines: string[] = [];
  lines.push(`# IDE context (${packet.product}) v1`);
  lines.push(`Collected: ${packet.collectedAt}`);
  lines.push("");

  if (packet.active) {
    lines.push("## Active");
    lines.push(`- URI: ${packet.active.uri}`);
    if (packet.active.languageId)
      lines.push(`- Language: ${packet.active.languageId}`);
    if (packet.active.isDirty !== undefined) {
      lines.push(`- Dirty: ${packet.active.isDirty ? "yes" : "no"}`);
    }
    if (packet.active.caret) {
      lines.push(
        `- Caret: ${packet.active.caret.line}:${packet.active.caret.character}`,
      );
    }
    if (packet.active.selection) {
      const s = packet.active.selection;
      lines.push(
        `- Selection: L${s.startLine}-L${s.endLine} (offsets ${s.from}-${s.to})${s.truncated ? " [truncated]" : ""}`,
      );
      if (s.text) {
        for (const line of s.text.split("\n")) {
          lines.push(`> ${line}`);
        }
      }
    }
    lines.push("");
  }

  if (packet.product === "markdownWorkshop") {
    lines.push("## Markdown");
    lines.push(`- Editor: ${packet.markdown.editorKind}`);
    if (packet.markdown.panelId)
      lines.push(`- Panel: ${packet.markdown.panelId}`);
    lines.push("");
  }

  lines.push("## Tabs (visible)");
  for (const u of packet.tabs.visible) lines.push(`- ${u}`);
  lines.push("## Tabs (open, capped)");
  for (const u of packet.tabs.open) lines.push(`- ${u}`);
  if (packet.tabs.truncated) lines.push("- …truncated");
  lines.push("");

  lines.push("## Diagnostics (active file, capped)");
  for (const d of packet.diagnostics.items) {
    lines.push(
      `- ${d.severity} L${d.startLine}:C${d.startCharacter} ${d.message}`,
    );
  }
  if (packet.diagnostics.truncated) lines.push("- …truncated");
  lines.push("");

  if (packet.product === "pdfWorkshop") {
    lines.push("## PDF");
    lines.push(`- URI: ${packet.pdf.uri}`);
    if (packet.pdf.page !== undefined) lines.push(`- Page: ${packet.pdf.page}`);
    if (packet.pdf.citeMarkdown)
      lines.push(`- Source: ${packet.pdf.citeMarkdown}`);
    lines.push(`- Selection: ${packet.pdf.selection.kind}`);
    if (packet.pdf.selection.kind === "text") {
      lines.push(
        `- Selected text:${packet.pdf.selection.truncated ? " [truncated]" : ""}`,
      );
      for (const line of packet.pdf.selection.text.split("\n"))
        lines.push(`> ${line}`);
      if (packet.pdf.selection.rects?.length) {
        for (const r of packet.pdf.selection.rects) {
          lines.push(`- Rect: p${r.page} ${r.x},${r.y} ${r.w}x${r.h}`);
        }
      }
    } else if (packet.pdf.selection.kind === "region") {
      for (const r of packet.pdf.selection.rects) {
        lines.push(`- Rect: p${r.page} ${r.x},${r.y} ${r.w}x${r.h}`);
      }
      if (packet.pdf.selection.regionImagePath) {
        lines.push(`- Region image: ${packet.pdf.selection.regionImagePath}`);
      }
    }
    if (packet.pdf.viewrect) {
      const v = packet.pdf.viewrect;
      lines.push(`- Viewport: ${v.x},${v.y} ${v.w}x${v.h}`);
    }
    if (packet.pdf.sourceSha256)
      lines.push(`- SHA-256: ${packet.pdf.sourceSha256}`);
    lines.push("");
  }

  if (packet.warnings.length > 0) {
    lines.push("Warnings:");
    for (const w of packet.warnings) lines.push(`- ${w}`);
  }

  return lines.join("\n");
}

const CLIPBOARD_BUDGET_WARNING =
  "packet budget: truncated/omitted fields to satisfy maxJsonChars|maxClipboardChars";

export function renderMarkdown(packet: IdeContextPacket): string {
  // NORMATIVE: scrubPacket → truncatePacket → encode
  // Clipboard cap is enforced by structured-field truncation driven by rendered Markdown length.
  let prepared = prepare(packet);
  const max = prepared.caps.maxClipboardChars;

  prepared = truncatePacket(prepared, prepared.caps, {
    underBudget: (p) => renderBody(p).length <= max,
  });

  let md = renderBody(prepared);
  if (md.length > max) {
    // Impossible-minimum fallback only: keep an explicit budget warning; never silent mid-URI cut.
    if (!prepared.warnings.some((w) => /budget|truncat/i.test(w))) {
      const msg = CLIPBOARD_BUDGET_WARNING.slice(
        0,
        prepared.caps.maxWarningChars,
      );
      prepared = {
        ...prepared,
        warnings: [...prepared.warnings, msg].slice(-prepared.caps.maxWarnings),
      };
      md = renderBody(prepared);
    }
    if (md.length > max) {
      const notice =
        "\n\nWarnings:\n- " +
        CLIPBOARD_BUDGET_WARNING.slice(0, prepared.caps.maxWarningChars) +
        "\n";
      const bodyBudget = Math.max(0, max - notice.length);
      md = md.slice(0, bodyBudget) + notice;
    }
  }
  return md;
}

export function serializeJson(packet: IdeContextPacket): string {
  const prepared = prepare(packet);
  const raw = JSON.stringify(prepared);
  if (raw.length > prepared.caps.maxJsonChars) {
    // truncatePacket should have handled this; fail soft by re-running with tighter caps
    const tighter = truncatePacket(prepared, {
      ...prepared.caps,
      maxSelectedChars: 0,
      maxPdfSelectedChars: 0,
      maxDiagnosticItems: 0,
      maxTabUris: 0,
    });
    return JSON.stringify(tighter);
  }
  return raw;
}
