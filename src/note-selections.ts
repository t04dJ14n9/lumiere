import type { MarkdownWorkshopApi } from "@workshop/markdown/host";
import type { NoteSelections } from "@workshop/pdf/host";

/**
 * PDF Workshop's agent bridge reads note selections through this adapter
 * over Markdown Workshop's public API. `api` is undefined until Markdown
 * Workshop has started.
 */
export function markdownNoteSelections(
  api: () => MarkdownWorkshopApi | undefined,
): NoteSelections {
  return {
    hasOpenNotes: () => (api()?.getEditors().length ?? 0) > 0,
    async current() {
      const markdown = api();
      if (!markdown) {
        return undefined;
      }
      // The active note first, then any note with a selection.
      const editors = [...markdown.getEditors()].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive),
      );
      for (const editor of editors) {
        const selection = await markdown
          .getSelection(editor.editorId)
          .catch(() => undefined);
        if (selection?.text) {
          return {
            uri: editor.uri,
            text: selection.text,
            startLine: selection.startLine,
            endLine: selection.endLine,
            isDirty: selection.isDirty,
          };
        }
      }
      return undefined;
    },
  };
}
