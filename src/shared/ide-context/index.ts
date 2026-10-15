export { DEFAULT_CAPS } from "./caps";
export {
  assertPacketInvariants,
  type ActiveResource,
  type DiagnosticItem,
  type IdeContextCaps,
  type IdeContextPacket,
  type IdeContextPacketBase,
  type MarkdownContext,
  type PdfContext,
  type PdfRect,
  type PdfSelectionWire,
} from "./types";
export { scrubDiagnosticMessage, scrubPacket, scrubUri } from "./scrub";
export { truncatePacket } from "./truncate";
export { renderMarkdown, serializeJson } from "./render";
export {
  resolveCanonicalActive,
  type HostActiveSnapshot,
  type ProductCanonicalSlice,
} from "./canonical";
export {
  gatherIdeContext,
  type IdeContextHostApis,
  type ProductGatherSlice,
} from "./gather";
export {
  leasePathFor,
  parseLease,
  readLease,
  renewLeaseAtomic,
  writeLeaseAtomic,
  type LeaseSidecar,
  type TempFs,
} from "./temp-lease";
export {
  publishIdeContextTemp,
  commitFinalPayload,
  type PublishOpts,
  type PublishResult,
} from "./temp-publish";
export {
  reclaimEligible,
  isReclaimablePayload,
  type ReclaimCaps,
} from "./temp-reclaim";

export {
  resolveIdeContextSendTarget,
  IDE_CONTEXT_AGENT_COMMANDS,
  type IdeContextTargetSetting,
  type IdeContextSendResolution,
  type IdeContextSendEnvironment,
} from "./resolve-target";
