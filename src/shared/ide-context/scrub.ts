import type { IdeContextPacket, DiagnosticItem } from "./types";

const SECRET_QUERY_KEY = /^(token|key|sig|access_token)$/i;
const SK_RE = /\bsk-[A-Za-z0-9]+\b/g;
const GHP_RE = /\bghp_[A-Za-z0-9]+\b/g;
const BEARER_RE = /bearer\s+\S+/gi;

/** Prefer scheme + tail when truncating long URIs. */
export function scrubUri(uri: string, maxChars: number): string {
  let out = uri;
  try {
    const qIndex = uri.indexOf("?");
    if (qIndex >= 0) {
      const base = uri.slice(0, qIndex);
      const query = uri.slice(qIndex + 1);
      const kept: string[] = [];
      for (const part of query.split("&")) {
        if (!part) continue;
        const eq = part.indexOf("=");
        const key = eq >= 0 ? part.slice(0, eq) : part;
        if (SECRET_QUERY_KEY.test(key)) continue;
        kept.push(part);
      }
      out = kept.length > 0 ? `${base}?${kept.join("&")}` : base;
    }
  } catch {
    // fail soft — keep original and still truncate
  }
  if (out.length <= maxChars) return out;
  // Prefer scheme + tail
  const schemeMatch = /^([a-z][a-z0-9+.-]*:\/\/)/i.exec(out);
  const scheme = schemeMatch?.[1] ?? "";
  const tailBudget = Math.max(0, maxChars - scheme.length);
  if (tailBudget <= 0) return out.slice(0, maxChars);
  return scheme + out.slice(out.length - tailBudget);
}

export function scrubDiagnosticMessage(msg: string, maxChars: number): string {
  let out = msg
    .replace(SK_RE, "[redacted]")
    .replace(GHP_RE, "[redacted]")
    .replace(BEARER_RE, "Bearer [redacted]");
  if (out.length > maxChars) out = out.slice(0, maxChars);
  return out;
}

function scrubDiagnosticItem(
  item: DiagnosticItem,
  maxMsg: number,
): DiagnosticItem {
  return {
    ...item,
    message: scrubDiagnosticMessage(item.message, maxMsg),
  };
}

/** Mandatory named sanitization stage — idempotent. */
export function scrubPacket(packet: IdeContextPacket): IdeContextPacket {
  const maxUri = packet.caps.maxUriChars;
  const maxMsg = packet.caps.maxDiagnosticMessageChars;

  const next: IdeContextPacket = {
    ...packet,
    active: packet.active
      ? { ...packet.active, uri: scrubUri(packet.active.uri, maxUri) }
      : packet.active,
    tabs: {
      ...packet.tabs,
      visible: packet.tabs.visible.map((u) => scrubUri(u, maxUri)),
      open: packet.tabs.open.map((u) => scrubUri(u, maxUri)),
    },
    diagnostics: {
      ...packet.diagnostics,
      uri: scrubUri(packet.diagnostics.uri, maxUri),
      items: packet.diagnostics.items.map((i) =>
        scrubDiagnosticItem(i, maxMsg),
      ),
    },
    warnings: [...packet.warnings],
    caps: packet.caps,
  };

  if (packet.product === "markdownWorkshop") {
    return {
      ...next,
      product: "markdownWorkshop",
      markdown: { ...packet.markdown },
    };
  }

  return {
    ...next,
    product: "pdfWorkshop",
    pdf: {
      ...packet.pdf,
      uri: scrubUri(packet.pdf.uri, maxUri),
      citeMarkdown: packet.pdf.citeMarkdown,
      selection: packet.pdf.selection,
    },
  };
}
