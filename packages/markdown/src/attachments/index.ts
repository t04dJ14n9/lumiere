export { resolveAttachmentDir } from "./folder";
export { timestampStem, uniqueTimestampName } from "./naming";
export { embedFor, type EmbedLink } from "./embed";
export { insertEmbed } from "./insert";
export { saveAttachment, type SaveAttachmentInput, type SavedAttachment } from "./save";
export {
  remoteImagesInMarkdown,
  rewriteRemoteImages,
  decodeDataUri,
  extensionForMime,
  extensionFromUrl,
} from "./html-images";
export { encodeBase64, decodeBase64 } from "./base64";
export {
  isAttachmentDrag,
  shouldClaimEditorDrop,
  urisFromDataTransfer,
  filesFromDataTransfer,
  type DragPayload,
  type DragFile,
} from "./drop";
export {
  isHostSourceUrl,
  loadAttachmentSource,
  type SourceBytes,
  type SourceFetch,
  type SourceRead,
} from "./source";
