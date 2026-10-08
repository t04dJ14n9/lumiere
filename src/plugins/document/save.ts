import type { HostDocument, Workbench } from "../../shared/runtime";
/** Preserve the source's workaround for overlapping workbench/webview saves. */
export async function saveDocument(document: HostDocument, workbench: Workbench): Promise<boolean> {
  if (!document.isDirty && !document.isUntitled) return true;
  let complete!: (saved: boolean) => void;
  const completion = new Promise<boolean>((resolve) => {
    complete = resolve;
  });
  const stop = workbench.onSave((saved) => {
    if (saved === document) complete(true);
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if ((await document.save()) || (!document.isDirty && !document.isUntitled)) return true;
    timeout = setTimeout(() => complete(false), 2000);
    return await completion;
  } finally {
    clearTimeout(timeout);
    await stop();
  }
}
