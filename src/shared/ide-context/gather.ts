import { resolveCanonicalActive, type HostActiveSnapshot } from "./canonical";
import { DEFAULT_CAPS } from "./caps";
import { scrubPacket } from "./scrub";
import type {
  ActiveResource,
  DiagnosticItem,
  IdeContextCaps,
  IdeContextPacket,
  MarkdownContext,
  PdfContext,
} from "./types";

export interface IdeContextHostApis {
  listTabs(): { visible: string[]; open: string[] };
  getDiagnostics(uri: string): DiagnosticItem[];
  activeTextEditor?: HostActiveSnapshot["activeTextEditor"];
  workspace?: { name?: string; folderCount: number };
  now?: () => Date;
}

export type ProductGatherSlice =
  | {
      product: "markdownWorkshop";
      uri: string;
      markdown: MarkdownContext;
      selection?: ActiveResource["selection"];
    }
  | {
      product: "pdfWorkshop";
      uri: string;
      pdf: Omit<PdfContext, "uri"> & { uri?: string };
    };

function canonicalUriFor(productSlice: ProductGatherSlice): string {
  return productSlice.product === "pdfWorkshop"
    ? (productSlice.pdf.uri ?? productSlice.uri)
    : productSlice.uri;
}

function productCanonicalFor(
  productSlice: ProductGatherSlice,
  canonicalUri: string,
) {
  if (productSlice.product !== "markdownWorkshop") {
    return { product: "pdfWorkshop" as const, uri: canonicalUri };
  }
  return {
    product: "markdownWorkshop" as const,
    uri: canonicalUri,
    ...(productSlice.selection !== undefined
      ? { selection: productSlice.selection }
      : {}),
  };
}

function assemblePacket(
  productSlice: ProductGatherSlice,
  canonicalUri: string,
  base: Omit<IdeContextPacket, "product" | "markdown" | "pdf">,
): IdeContextPacket {
  if (productSlice.product === "markdownWorkshop") {
    return {
      ...base,
      product: "markdownWorkshop",
      markdown: productSlice.markdown,
    };
  }
  return {
    ...base,
    product: "pdfWorkshop",
    pdf: {
      ...productSlice.pdf,
      uri: canonicalUri,
      selection: productSlice.pdf.selection,
    },
  };
}

export function gatherIdeContext(
  hostApis: IdeContextHostApis,
  productSlice: ProductGatherSlice,
  caps: IdeContextCaps = DEFAULT_CAPS,
): IdeContextPacket {
  const collectedAt = (hostApis.now?.() ?? new Date()).toISOString();
  const canonicalUri = canonicalUriFor(productSlice);
  const hostSnapshot: HostActiveSnapshot =
    hostApis.activeTextEditor !== undefined
      ? { activeTextEditor: hostApis.activeTextEditor }
      : {};
  const { active, warnings } = resolveCanonicalActive(
    productCanonicalFor(productSlice, canonicalUri),
    hostSnapshot,
  );
  const diagItems = gatherDiagnostics(hostApis, canonicalUri, warnings);
  const tabs = gatherTabs(hostApis, warnings);
  const base = {
    version: 1 as const,
    collectedAt,
    ...(hostApis.workspace !== undefined
      ? { workspace: hostApis.workspace }
      : {}),
    active,
    tabs: {
      visible: tabs.visible,
      open: tabs.open,
      truncated: false,
    },
    diagnostics: {
      uri: canonicalUri,
      items: diagItems,
      truncated: false,
    },
    warnings,
    caps,
  };
  // Gathering may scrub; render still re-scrubs (idempotent).
  return scrubPacket(assemblePacket(productSlice, canonicalUri, base));
}

function gatherTabs(
  host: Pick<IdeContextHostApis, "listTabs">,
  warnings: string[],
) {
  try {
    return host.listTabs();
  } catch {
    warnings.push("tab enumeration unavailable");
    return { visible: [], open: [] };
  }
}

function gatherDiagnostics(
  host: Pick<IdeContextHostApis, "getDiagnostics">,
  uri: string,
  warnings: string[],
): DiagnosticItem[] {
  try {
    return host.getDiagnostics(uri);
  } catch {
    warnings.push("diagnostics unavailable for canonical URI");
    return [];
  }
}
