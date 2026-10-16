import {
  gatherIdeContext,
  type IdeContextHostApis,
  type IdeContextPacket,
  type IdeContextCaps,
  DEFAULT_CAPS,
} from "../../shared/ide-context";
import type { SourceSelection } from "../editor/api";

export interface MwIdeContextInput {
  uri: string;
  editorKind: "livePreview" | "text" | "unknown";
  panelId?: string;
  selection?: SourceSelection;
  host: IdeContextHostApis;
  caps?: IdeContextCaps;
}

/** Build a markdownWorkshop IdeContextPacket (no pdf key). */
export function buildMwIdeContextPacket(
  input: MwIdeContextInput,
): IdeContextPacket {
  const selection = input.selection
    ? {
        from: input.selection.from,
        to: input.selection.to,
        startLine: input.selection.startLine,
        endLine: input.selection.endLine,
        text: input.selection.text,
        truncated: false,
      }
    : undefined;
  return gatherIdeContext(
    input.host,
    {
      product: "markdownWorkshop",
      uri: input.uri,
      markdown: {
        editorKind: input.editorKind,
        ...(input.panelId ? { panelId: input.panelId } : {}),
      },
      selection,
    },
    input.caps ?? DEFAULT_CAPS,
  );
}

export function assertMwPacket(packet: IdeContextPacket): void {
  if (packet.product !== "markdownWorkshop") {
    throw new Error("expected markdownWorkshop packet");
  }
  if ("pdf" in packet && (packet as { pdf?: unknown }).pdf !== undefined) {
    throw new Error("MW packet must not carry pdf slice");
  }
}
