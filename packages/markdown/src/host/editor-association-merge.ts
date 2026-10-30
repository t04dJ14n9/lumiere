/**
 * Merge `workbench.editorAssociations` the way VS Code resolves them:
 * user, then workspace, then workspace folder. Non-string entries are ignored.
 */
export function mergeEditorAssociations(layers: readonly unknown[]): unknown {
  const merged: Record<string, string> = {};
  let sawLayer = false;
  for (const layer of layers) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      continue;
    }
    sawLayer = true;
    for (const [pattern, editor] of Object.entries(layer)) {
      if (typeof editor === "string") {
        merged[pattern] = editor;
      }
    }
  }
  return sawLayer ? merged : {};
}
