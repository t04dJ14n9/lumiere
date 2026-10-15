import { resolveCanonicalActive, type HostActiveSnapshot, type ProductCanonicalSlice } from "./canonical";
import { DEFAULT_CAPS } from "./caps";
import { scrubPacket } from "./scrub";
import type {
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
      selection?: ProductCanonicalSlice extends { selection?: infer S } ? S : never;
    }
  | {
      product: "pdfWorkshop";
      uri: string;
      pdf: Omit<PdfContext, "uri"> & { uri?: string };
    };

export function gatherIdeContext(
  hostApis: IdeContextHostApis,
  productSlice: ProductGatherSlice,
  caps: IdeContextCaps = DEFAULT_CAPS,
): IdeContextPacket {
  const collectedAt = (hostApis.now?.() ?? new Date()).toISOString();
  const canonicalUri =
    productSlice.product === "pdfWorkshop"
      ? productSlice.pdf.uri ?? productSlice.uri
      : productSlice.uri;

  const { active, warnings } = resolveCanonicalActive(
    productSlice.product === "markdownWorkshop"
      ? {
          product: "markdownWorkshop",
          uri: canonicalUri,
          selection: productSlice.selection,
        }
      : { product: "pdfWorkshop", uri: canonicalUri },
    { activeTextEditor: hostApis.activeTextEditor },
  );

  // PDF: enforce active.uri === pdf.uri
  if (productSlice.product === "pdfWorkshop") {
    active.uri = canonicalUri;
  }

  let diagItems: DiagnosticItem[] = [];
  try {
    diagItems = hostApis.getDiagnostics(canonicalUri);
  } catch {
    warnings.push("diagnostics unavailable for canonical URI");
  }

  const tabs = hostApis.listTabs();
  const base = {
    version: 1 as const,
    collectedAt,
    workspace: hostApis.workspace,
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

  const packet: IdeContextPacket =
    productSlice.product === "markdownWorkshop"
      ? {
          ...base,
          product: "markdownWorkshop",
          markdown: productSlice.markdown,
        }
      : {
          ...base,
          product: "pdfWorkshop",
          pdf: {
            ...productSlice.pdf,
            uri: canonicalUri,
            selection: productSlice.pdf.selection,
          },
        };

  // Gathering may scrub; render still re-scrubs (idempotent).
  return scrubPacket(packet);
}
