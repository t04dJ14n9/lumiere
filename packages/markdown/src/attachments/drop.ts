/**
 * Pure helpers for editor drag-and-drop of files / URIs into the attachment
 * folder. Callers must preventDefault on dragover + drop when
 * `shouldClaimEditorDrop` is true so the host does not open the file as a tab.
 *
 * Uses a structural drag payload so this module stays free of DOM lib types
 * (shared with the host half).
 */

const URI_LIST = "text/uri-list";
const CODE_URI_LIST = "application/vnd.code.uri-list";
/** VS Code Explorer / editor drag payload (JSON array of URI strings). */
const RESOURCE_URLS = "ResourceURLs";

const URI_TYPES = [URI_LIST, CODE_URI_LIST, RESOURCE_URLS] as const;

/** Minimal DataTransfer shape used by the attachment drop helpers. */
export interface DragPayload {
  readonly types: ArrayLike<string>;
  readonly files: ArrayLike<{
    readonly name: string;
    readonly type: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
  getData(format: string): string;
}

/** True when the drag carries files or resource URIs we should intercept. */
export function isAttachmentDrag(data: DragPayload | null): boolean {
  if (!data) {
    return false;
  }
  const types = Array.from(data.types);
  if (types.includes("Files") || URI_TYPES.some((type) => types.includes(type))) {
    return true;
  }
  return data.files.length > 0;
}

/** Alias used by the webview: claiming the drop blocks VS Code's open-tab. */
export function shouldClaimEditorDrop(data: DragPayload | null): boolean {
  return isAttachmentDrag(data);
}

/** File:// and http(s) URIs from uri-list flavours (Explorer / OS without File). */
export function urisFromDataTransfer(data: DragPayload | null): string[] {
  if (!data) {
    return [];
  }
  const found: string[] = [];
  const types = Array.from(data.types);
  if (types.includes(URI_LIST)) {
    for (const line of data.getData(URI_LIST).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        found.push(trimmed);
      }
    }
  }
  for (const mime of [CODE_URI_LIST, RESOURCE_URLS] as const) {
    if (!types.includes(mime)) {
      continue;
    }
    const raw = data.getData(mime);
    if (!raw.trim()) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && item.trim()) {
            found.push(item.trim());
          }
        }
      }
    } catch {
      // Not JSON — ignore.
    }
  }
  return [...new Set(found)];
}

export type DragFile = DragPayload["files"] extends ArrayLike<infer F> ? F : never;

/** Files from the FileList (OS drops). */
export function filesFromDataTransfer(data: DragPayload | null): DragFile[] {
  if (!data) {
    return [];
  }
  return Array.from(data.files);
}
